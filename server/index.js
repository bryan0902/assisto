require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const jwt      = require('jsonwebtoken');
const bcrypt   = require('bcryptjs');
const path     = require('path');
const db       = require('./db/database');

const app    = express();
const SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  console.error('Falta JWT_SECRET. Copia .env.example a .env y define el valor.');
  process.exit(1);
}
const PORT   = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit:'10mb' }));
app.use(express.static(path.join(__dirname,'../client')));

// ─── HELPERS ────────────────────────────────────────
function fechaLocal(offsetDias=0) {
  const d=new Date(); d.setDate(d.getDate()-offsetDias);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function auth(roles=[]) {
  return (req,res,next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({error:'Sin token'});
    try {
      req.user = jwt.verify(token, SECRET);
      if (roles.length && !roles.includes(req.user.rol)) return res.status(403).json({error:'Sin permiso'});
      next();
    } catch { res.status(401).json({error:'Token inválido'}); }
  };
}

function log(uid, accion, detalle, tipo='info', campus_id=null) {
  try { db.prepare(`INSERT INTO actividad_log (usuario_id,campus_id,accion,detalle,tipo) VALUES (?,?,?,?,?)`).run(uid,campus_id,accion,detalle,tipo); } catch{}
}

function campusAutorizados(user) {
  if (user.rol === 'superadmin') return null;
  if (user.rol === 'docente') return [user.campus_id].filter(Boolean);
  try {
    const rows = db.prepare('SELECT campus_id FROM director_campus WHERE usuario_id=?').all(user.id);
    const ids  = rows.map(r => r.campus_id);
    if (user.campus_id && !ids.includes(user.campus_id)) ids.push(user.campus_id);
    return ids.length ? ids : [user.campus_id].filter(Boolean);
  } catch { return [user.campus_id].filter(Boolean); }
}

function primerCampusId() {
  return db.prepare('SELECT id FROM campus WHERE activo=1 ORDER BY id LIMIT 1').get()?.id || 1;
}

// ═══════════════════════════════════════════════════
//  AUTH
// ═══════════════════════════════════════════════════
app.post('/api/login', (req,res) => {
  const { username, password } = req.body;
  const u = db.prepare("SELECT * FROM usuarios WHERE username=? AND estado='activo'").get(username);
  if (!u || !bcrypt.compareSync(password, u.password)) return res.status(401).json({error:'Credenciales incorrectas'});
  db.prepare("UPDATE usuarios SET ultimo_acceso=datetime('now','localtime') WHERE id=?").run(u.id);
  log(u.id,'LOGIN','Sesión iniciada','info',u.campus_id);
  const token = jwt.sign({ id:u.id, nombre:u.nombre, rol:u.rol, campus_id:u.campus_id }, SECRET, {expiresIn:'12h'});
  res.json({ token, user:{ id:u.id, nombre:u.nombre, rol:u.rol, email:u.email, campus_id:u.campus_id } });
});

app.post('/api/logout', auth(), (req,res) => {
  log(req.user.id,'LOGOUT','Sesión cerrada','info',req.user.campus_id);
  res.json({ok:true});
});

// ═══════════════════════════════════════════════════
//  DASHBOARD
// ═══════════════════════════════════════════════════
// ─────────────────────────────────────────────────────
// ENDPOINT: GET /api/dashboard
// Acceso: todos los roles (superadmin, director, docente)
// Devuelve todas las estadisticas necesarias para el panel principal.
// Dependiendo del rol del usuario que hace la peticion, los datos
// se filtran de forma diferente:
//   - superadmin: ve datos de todos los campus de la institucion
//   - director: ve datos solo de los campus que tiene autorizados
//   - docente: ve datos unicamente de sus propias materias y alumnos
// ─────────────────────────────────────────────────────
app.get('/api/dashboard', auth(), (req,res) => {
  try {
    // Determinar el rol del usuario para filtrar los datos correctamente
    const esDocente    = req.user.rol === 'docente';
    const esSuperAdmin = req.user.rol === 'superadmin';
    const campusId     = req.user.campus_id; // campus del usuario (null si es superadmin)
    let stats = {}, asistHoy = [];           // stats: tarjetas superiores; asistHoy: dona del dia

    if (esDocente) {
      // ── Bloque exclusivo para docentes ────────────────
      // Buscar el registro de profesor vinculado al usuario actual
      // Un usuario con rol 'docente' debe tener una fila en la tabla 'profesores'
      const prof = db.prepare('SELECT id FROM profesores WHERE usuario_id=?').get(req.user.id);
      const pid  = prof?.id || -1; // Si no tiene perfil de profesor, usar -1 para que no devuelva datos

      // Contar asistencias registradas HOY en las materias de este profesor
      // Se agrupa por estatus (P/T/A/J) para alimentar la grafica de dona
      asistHoy = db.prepare(`SELECT asi.status, COUNT(*) as c FROM asistencias asi JOIN materias m ON m.id=asi.materia_id WHERE m.profesor_id=? AND asi.fecha=? GROUP BY asi.status`).all(pid, fechaLocal(0));

      // Calcular el porcentaje de asistencia de los ultimos 7 dias
      // (Presentes + Tardanzas) / Total * 100
      const pctSemana = db.prepare(`SELECT ROUND(100.0*SUM(CASE WHEN asi.status IN ('P','T') THEN 1 ELSE 0 END)/COUNT(*),1) as pct FROM asistencias asi JOIN materias m ON m.id=asi.materia_id WHERE m.profesor_id=? AND asi.fecha>=?`).get(pid, fechaLocal(6))?.pct||0;

      // Armar el objeto de estadisticas para las tarjetas del dashboard del docente
      stats = {
        alumnos:    db.prepare(`SELECT COUNT(DISTINCT asi.alumno_id) as c FROM asistencias asi JOIN materias m ON m.id=asi.materia_id WHERE m.profesor_id=?`).get(pid).c, // total alumnos distintos con asistencia registrada
        materias:   db.prepare('SELECT COUNT(*) as c FROM materias WHERE profesor_id=?').get(pid).c, // total materias asignadas al docente
        asistHoy:   asistHoy.reduce((s,r)=>s+r.c,0), // suma total de registros de hoy
        pctSemana,  // porcentaje promedio de la semana
        esDocente:  true // flag para que el frontend sepa que dashboard mostrar
      };
    } else {
      // ── Bloque para superadmin y director ─────────────
      // Obtener la lista de IDs de campus que este usuario puede ver
      // Si es superadmin: ids = null (sin filtro, ve todo)
      // Si es director: ids = [1, 3] por ejemplo (solo sus campus autorizados)
      const ids    = campusAutorizados(req.user);

      // Construir el fragmento SQL de filtro por campus
      // Si ids es null (superadmin), el filtro queda vacio (sin restriccion)
      // Si ids tiene valores, genera: AND campus_id IN (?,?,?)
      const inFilt = ids ? ` AND campus_id IN (${ids.map(()=>'?').join(',')})` : '';
      const p      = ids || []; // parametros para el filtro, array vacio si superadmin

      // Registros de asistencia de HOY agrupados por estatus para la dona
      asistHoy = db.prepare(`SELECT status, COUNT(*) as c FROM asistencias WHERE fecha=?${inFilt} GROUP BY status`).all(fechaLocal(0), ...p);

      // Contar totales para las tarjetas del dashboard
      stats = {
        alumnos:    db.prepare(`SELECT COUNT(*) as c FROM alumnos WHERE estado='activo'${inFilt}`).get(...p).c,
        profesores: db.prepare(`SELECT COUNT(*) as c FROM profesores WHERE estado='activo'${inFilt}`).get(...p).c,
        materias:   db.prepare(`SELECT COUNT(*) as c FROM materias WHERE 1=1${inFilt}`).get(...p).c,
        grupos:     db.prepare(`SELECT COUNT(*) as c FROM grupos WHERE activo=1${inFilt}`).get(...p).c,
        // El conteo de campus solo aplica para superadmin
        campus:     esSuperAdmin ? db.prepare('SELECT COUNT(*) as c FROM campus WHERE activo=1').get().c : null,
        esDocente:  false, // indica al frontend que debe mostrar el dashboard de admin
        esSuperAdmin
      };
    }

    // Actividad reciente
    const ids2 = campusAutorizados(req.user);
    const inFilt2 = ids2 ? ` WHERE al.campus_id IN (${ids2.map(()=>'?').join(',')})` : '';
    const actividad = esDocente
      ? db.prepare(`SELECT accion,detalle,tipo,fecha FROM actividad_log WHERE usuario_id=? ORDER BY id DESC LIMIT 10`).all(req.user.id)
      : db.prepare(`SELECT al.accion,al.detalle,al.tipo,al.fecha,u.nombre as usuario FROM actividad_log al LEFT JOIN usuarios u ON u.id=al.usuario_id${inFilt2} ORDER BY al.id DESC LIMIT 12`).all(...(ids2||[]));

    // Gráfica semanal Lunes→Sábado semana actual
    const semana = [];
    const hoyRef = new Date();
    const diaSemanaHoy = hoyRef.getDay();
    const offsetAlLunes = diaSemanaHoy === 0 ? -6 : 1 - diaSemanaHoy;
    const fechaHoyStr = fechaLocal(0);
    const ids3 = campusAutorizados(req.user);
    const inFilt3     = ids3 ? ` AND a.campus_id IN (${ids3.map(()=>'?').join(',')})` : '';
    const inFilt3bare = ids3 ? ` AND campus_id IN (${ids3.map(()=>'?').join(',')})` : '';

    for (let dIdx=0; dIdx<=5; dIdx++) {
      const d = new Date(hoyRef); d.setDate(hoyRef.getDate() + offsetAlLunes + dIdx);
      const yy=d.getFullYear(), mm=String(d.getMonth()+1).padStart(2,'0'), dd=String(d.getDate()).padStart(2,'0');
      const f = `${yy}-${mm}-${dd}`;
      const esFuturo = f > fechaHoyStr;
      let rows = [];
      if (!esFuturo) {
        if (esDocente) {
          const prof = db.prepare('SELECT id FROM profesores WHERE usuario_id=?').get(req.user.id);
          rows = db.prepare(`SELECT asi.status,COUNT(*) as c FROM asistencias asi JOIN materias m ON m.id=asi.materia_id WHERE m.profesor_id=? AND asi.fecha=? GROUP BY asi.status`).all(prof?.id||-1, f);
        } else {
          rows = db.prepare(`SELECT status,COUNT(*) as c FROM asistencias WHERE fecha=?${inFilt3bare} GROUP BY status`).all(f, ...(ids3||[]));
        }
      }
      const tot = rows.reduce((s,r)=>s+r.c,0);
      const pre = (rows.find(r=>r.status==='P')?.c||0)+(rows.find(r=>r.status==='T')?.c||0);
      const DIAS=['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
      semana.push({ fecha:f, dia:DIAS[d.getDay()], pct:tot?Math.round(pre/tot*100):0, total:tot, esFuturo, esHoy:f===fechaHoyStr, P:rows.find(r=>r.status==='P')?.c||0, T:rows.find(r=>r.status==='T')?.c||0, A:rows.find(r=>r.status==='A')?.c||0, J:rows.find(r=>r.status==='J')?.c||0 });
    }

    // Semana actual vs anterior
    const lunesOff  = diaSemanaHoy===0?6:diaSemanaHoy-1;
    const lunesStr  = fechaLocal(lunesOff);
    const calcDate  = (base,offset) => { const d=new Date(base+'T12:00:00'); d.setDate(d.getDate()+offset); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
    const vierStr   = calcDate(lunesStr,4);
    const lunesPStr = calcDate(lunesStr,-7);
    const vierPStr  = calcDate(vierStr,-7);
    const calcPct   = rows => { const t=rows.reduce((s,r)=>s+r.c,0); const p=(rows.find(r=>r.status==='P')?.c||0)+(rows.find(r=>r.status==='T')?.c||0); return t?Math.round(p/t*100):0; };
    const rSA = db.prepare(`SELECT status,COUNT(*) as c FROM asistencias WHERE fecha BETWEEN ? AND ?${inFilt3bare} GROUP BY status`).all(lunesStr,vierStr,...(ids3||[]));
    const rSP = db.prepare(`SELECT status,COUNT(*) as c FROM asistencias WHERE fecha BETWEEN ? AND ?${inFilt3bare} GROUP BY status`).all(lunesPStr,vierPStr,...(ids3||[]));
    const pctSemAct = calcPct(rSA), pctSemPas = calcPct(rSP);

    // Promedio del mes
    const primerMes = `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}-01`;
    const rowsMes = db.prepare(`SELECT fecha,status,COUNT(*) as c FROM asistencias WHERE fecha>=?${inFilt3bare} GROUP BY fecha,status`).all(primerMes,...(ids3||[]));
    const diasMes = {};
    rowsMes.forEach(r=>{ if(!diasMes[r.fecha])diasMes[r.fecha]={tot:0,pre:0}; diasMes[r.fecha].tot+=r.c; if(r.status==='P'||r.status==='T')diasMes[r.fecha].pre+=r.c; });
    const datosMes = Object.entries(diasMes).sort(([a],[b])=>a.localeCompare(b)).map(([f,d])=>({fecha:f,pct:d.tot?Math.round(d.pre/d.tot*100):0}));
    const promedioMes = datosMes.length?Math.round(datosMes.reduce((s,d)=>s+d.pct,0)/datosMes.length):0;

    // Ranking grupos y top faltas
    const rankingGrupos = db.prepare(`SELECT g.nombre, COUNT(*) as tot, SUM(CASE WHEN a.status IN ('P','T') THEN 1 ELSE 0 END) as pre FROM asistencias a JOIN grupos g ON g.id=a.grupo_id WHERE a.fecha>=?${inFilt3} GROUP BY g.id ORDER BY pre*1.0/NULLIF(COUNT(*),0) DESC LIMIT 5`).all(primerMes,...(ids3||[])).map(r=>({nombre:r.nombre,pct:r.tot?Math.round(r.pre/r.tot*100):0}));
    const topFaltas = db.prepare(`SELECT al.matricula, al.nombre, COUNT(*) as faltas FROM asistencias a JOIN alumnos al ON al.id=a.alumno_id WHERE a.status='A' AND a.fecha BETWEEN ? AND ?${inFilt3} GROUP BY a.alumno_id ORDER BY faltas DESC LIMIT 5`).all(lunesStr,vierStr,...(ids3||[]));

    // Cuatrimestre activo
    const ids4 = campusAutorizados(req.user);
    const cuatri = ids4
      ? db.prepare('SELECT * FROM cuatrimestres WHERE activo=1 AND campus_id=? LIMIT 1').get(ids4[0]||campusId)
      : db.prepare('SELECT * FROM cuatrimestres WHERE activo=1 LIMIT 1').get();

    res.json({ stats, actividad, semana, asistHoy, pctSemAct, pctSemPas, promedioMes, datosMes, rankingGrupos, topFaltas, cuatri });
  } catch(e) { console.error('Dashboard error:',e.message,e.stack); res.status(500).json({error:e.message}); }
});

// ═══════════════════════════════════════════════════
//  CAMPUS
// ═══════════════════════════════════════════════════
app.get('/api/campus', auth(), (req,res) => {
  const ids = campusAutorizados(req.user);
  let q = `SELECT c.*, dir.nombre as director_nombre, dir.email as director_email, COUNT(DISTINCT u.id) as total_usuarios, COUNT(DISTINCT g.id) as total_grupos, COUNT(DISTINCT al.id) as total_alumnos, (SELECT COUNT(*) FROM cuatrimestres ct WHERE ct.campus_id=c.id AND ct.activo=1) as tiene_cuatri_activo FROM campus c LEFT JOIN usuarios dir ON dir.id=c.director_id LEFT JOIN usuarios u ON u.campus_id=c.id AND u.rol!='superadmin' LEFT JOIN grupos g ON g.campus_id=c.id AND g.activo=1 LEFT JOIN alumnos al ON al.campus_id=c.id AND al.estado='activo' WHERE c.activo=1`;
  const params = [];
  if (ids) { q+=` AND c.id IN (${ids.map(()=>'?').join(',')})`; params.push(...ids); }
  q+=' GROUP BY c.id ORDER BY c.nombre';
  res.json(db.prepare(q).all(...params));
});

app.post('/api/campus', auth(['superadmin']), (req,res) => {
  const {nombre,clave,direccion,telefono,email,ciudad,estado_rep} = req.body;
  try {
    const r = db.prepare('INSERT INTO campus (nombre,clave,direccion,telefono,email,ciudad,estado_rep) VALUES (?,?,?,?,?,?,?)').run(nombre,clave,direccion||null,telefono||null,email||null,ciudad||null,estado_rep||null);
    const insCuatri = db.prepare('INSERT OR IGNORE INTO cuatrimestres (campus_id,numero,anio,nombre,fecha_ini,fecha_fin,activo) VALUES (?,?,?,?,?,?,?)');
    insCuatri.run(r.lastInsertRowid,1,2026,'Cuatrimestre 1 — 2026','2026-01-12','2026-04-30',1);
    insCuatri.run(r.lastInsertRowid,2,2026,'Cuatrimestre 2 — 2026','2026-05-04','2026-08-28',0);
    insCuatri.run(r.lastInsertRowid,3,2026,'Cuatrimestre 3 — 2026','2026-09-01','2026-12-18',0);
    log(req.user.id,'CREAR_CAMPUS',nombre,'success');
    res.json({id:r.lastInsertRowid});
  } catch { res.status(400).json({error:'Clave ya existe'}); }
});

app.put('/api/campus/:id', auth(['superadmin']), (req,res) => {
  const {nombre,clave,direccion,telefono,email,ciudad,estado_rep,activo,director_id} = req.body;
  db.prepare('UPDATE campus SET nombre=?,clave=?,direccion=?,telefono=?,email=?,ciudad=?,estado_rep=?,activo=?,director_id=? WHERE id=?').run(nombre,clave,direccion||null,telefono||null,email||null,ciudad||null,estado_rep||null,activo??1,director_id||null,req.params.id);
  if (director_id) { try { db.prepare('INSERT OR IGNORE INTO director_campus (usuario_id,campus_id,autorizado_por) VALUES (?,?,?)').run(director_id,req.params.id,req.user.id); } catch{} }
  res.json({ok:true});
});

app.get('/api/campus/:id/permisos', auth(['superadmin']), (req,res) => {
  res.json(db.prepare('SELECT dc.*, u.nombre as director_nombre, u.email as director_email FROM director_campus dc JOIN usuarios u ON u.id=dc.usuario_id WHERE dc.campus_id=? ORDER BY u.nombre').all(req.params.id));
});

app.post('/api/campus/:id/permisos', auth(['superadmin']), (req,res) => {
  const {usuario_id} = req.body;
  try {
    db.prepare('INSERT OR IGNORE INTO director_campus (usuario_id,campus_id,autorizado_por) VALUES (?,?,?)').run(usuario_id,req.params.id,req.user.id);
    const u = db.prepare('SELECT campus_id FROM usuarios WHERE id=?').get(usuario_id);
    if (!u?.campus_id) db.prepare('UPDATE usuarios SET campus_id=? WHERE id=?').run(req.params.id,usuario_id);
    res.json({ok:true});
  } catch(e) { res.status(400).json({error:e.message}); }
});

app.delete('/api/campus/:id/permisos/:uid', auth(['superadmin']), (req,res) => {
  db.prepare('DELETE FROM director_campus WHERE campus_id=? AND usuario_id=?').run(req.params.id,req.params.uid);
  res.json({ok:true});
});

// ═══════════════════════════════════════════════════
//  USUARIOS
// ═══════════════════════════════════════════════════
app.get('/api/usuarios', auth(['superadmin','director']), (req,res) => {
  const ids = campusAutorizados(req.user);
  let q = "SELECT u.*, c.nombre as campus_nombre FROM usuarios u LEFT JOIN campus c ON c.id=u.campus_id WHERE 1=1";
  const params = [];
  if (ids) { q+=` AND (u.campus_id IN (${ids.map(()=>'?').join(',')}) OR u.rol='superadmin')`; params.push(...ids); }
  q+=' ORDER BY u.campus_id, u.rol, u.nombre';
  res.json(db.prepare(q).all(...params));
});

app.post('/api/usuarios', auth(['superadmin','director']), (req,res) => {
  const {nombre,username,password,rol,email,estado,campus_id} = req.body;
  if (req.user.rol==='director' && rol==='superadmin') return res.status(403).json({error:'Sin permiso'});
  const cid = req.user.rol==='superadmin' ? (campus_id||null) : req.user.campus_id;
  try {
    const hash = bcrypt.hashSync(password,10);
    const r = db.prepare('INSERT INTO usuarios (campus_id,nombre,username,password,rol,email,estado) VALUES (?,?,?,?,?,?,?)').run(cid,nombre,username,hash,rol,email||null,estado||'activo');
    log(req.user.id,'CREAR_USUARIO',nombre,'success',cid);
    res.json({id:r.lastInsertRowid});
  } catch { res.status(400).json({error:'Username ya existe'}); }
});

app.put('/api/usuarios/:id', auth(['superadmin','director']), (req,res) => {
  const {nombre,username,password,rol,email,estado,campus_id} = req.body;
  const u = db.prepare('SELECT * FROM usuarios WHERE id=?').get(req.params.id);
  if (!u) return res.status(404).json({error:'No encontrado'});
  if (req.user.rol==='director' && u.campus_id!==req.user.campus_id) return res.status(403).json({error:'Sin permiso'});
  const cid  = req.user.rol==='superadmin' ? (campus_id??u.campus_id) : u.campus_id;
  const hash = password ? bcrypt.hashSync(password,10) : u.password;
  db.prepare('UPDATE usuarios SET campus_id=?,nombre=?,username=?,password=?,rol=?,email=?,estado=? WHERE id=?').run(cid,nombre,username,hash,rol,email||null,estado,req.params.id);
  res.json({ok:true});
});

app.delete('/api/usuarios/:id', auth(['superadmin']), (req,res) => {
  db.prepare('DELETE FROM usuarios WHERE id=?').run(req.params.id);
  res.json({ok:true});
});

app.get('/api/usuarios/:id/permisos-campus', auth(['superadmin']), (req,res) => {
  try { res.json(db.prepare('SELECT dc.campus_id, c.nombre as campus_nombre, c.clave FROM director_campus dc JOIN campus c ON c.id=dc.campus_id WHERE dc.usuario_id=? ORDER BY c.nombre').all(req.params.id)); }
  catch { res.json([]); }
});

// ═══════════════════════════════════════════════════
//  PROFESORES
// ═══════════════════════════════════════════════════
app.get('/api/profesores', auth(['superadmin','director']), (req,res) => {
  const ids = campusAutorizados(req.user);
  let q = "SELECT p.*, c.nombre as campus_nombre, (SELECT GROUP_CONCAT(codigo, ', ') FROM materias WHERE profesor_id=p.id) as materias_codigos FROM profesores p LEFT JOIN campus c ON c.id=p.campus_id WHERE 1=1";
  const params = [];
  if (ids) { q+=` AND p.campus_id IN (${ids.map(()=>'?').join(',')})`; params.push(...ids); }
  q+=' ORDER BY c.nombre, p.nombre';
  res.json(db.prepare(q).all(...params));
});

app.post('/api/profesores', auth(['superadmin','director']), (req,res) => {
  const {nombre,email,telefono,cedula,especialidad,estado,campus_id} = req.body;
  let cid = req.user.rol==='superadmin'?(campus_id||req.user.campus_id):req.user.campus_id;
  if (!cid) cid = primerCampusId();
  const r = db.prepare('INSERT INTO profesores (campus_id,nombre,email,telefono,cedula,especialidad,estado) VALUES (?,?,?,?,?,?,?)').run(cid,nombre,email||null,telefono||null,cedula||null,especialidad||null,estado||'activo');
  log(req.user.id,'CREAR_PROFESOR',nombre,'success',cid);
  res.json({id:r.lastInsertRowid});
});

app.put('/api/profesores/:id', auth(['superadmin','director']), (req,res) => {
  const {nombre,email,telefono,cedula,especialidad,estado} = req.body;
  db.prepare('UPDATE profesores SET nombre=?,email=?,telefono=?,cedula=?,especialidad=?,estado=? WHERE id=?').run(nombre,email||null,telefono||null,cedula||null,especialidad||null,estado,req.params.id);
  res.json({ok:true});
});

app.delete('/api/profesores/:id', auth(['superadmin','director']), (req,res) => {
  db.prepare('DELETE FROM profesores WHERE id=?').run(req.params.id);
  res.json({ok:true});
});

// Profesores sin cuenta de usuario — para que superadmin les cree acceso
app.get('/api/profesores/sin-usuario', auth(['superadmin','director']), (req,res) => {
  const ids = campusAutorizados(req.user);
  let q = `SELECT p.*, c.nombre as campus_nombre FROM profesores p
    LEFT JOIN campus c ON c.id=p.campus_id
    WHERE p.usuario_id IS NULL AND p.estado='activo'`;
  const params = [];
  if (ids) { q+=` AND p.campus_id IN (${ids.map(()=>'?').join(',')})`; params.push(...ids); }
  q += ' ORDER BY p.nombre';
  res.json(db.prepare(q).all(...params));
});

// Vincular usuario existente a un profesor
app.post('/api/profesores/:id/vincular-usuario', auth(['superadmin']), (req,res) => {
  const {usuario_id} = req.body;
  try {
    db.prepare('UPDATE profesores SET usuario_id=? WHERE id=?').run(usuario_id, req.params.id);
    // Si el usuario no tiene campus, asignarle el del profesor
    const prof = db.prepare('SELECT campus_id FROM profesores WHERE id=?').get(req.params.id);
    if (prof?.campus_id) {
      db.prepare('UPDATE usuarios SET campus_id=? WHERE id=? AND campus_id IS NULL').run(prof.campus_id, usuario_id);
    }
    log(req.user.id,'VINCULAR_USUARIO_PROF',`Profesor ${req.params.id} → Usuario ${usuario_id}`,'success');
    res.json({ok:true});
  } catch(e) { res.status(400).json({error:e.message}); }
});

// Crear cuenta de usuario para un profesor directamente
app.post('/api/profesores/:id/crear-cuenta', auth(['superadmin']), (req,res) => {
  const {username, password} = req.body;
  const prof = db.prepare('SELECT * FROM profesores WHERE id=?').get(req.params.id);
  if (!prof) return res.status(404).json({error:'Profesor no encontrado'});
  if (prof.usuario_id) return res.status(400).json({error:'Este profesor ya tiene cuenta de usuario'});
  try {
    const hash = require('bcryptjs').hashSync(password, 10);
    const r = db.prepare('INSERT INTO usuarios (campus_id,nombre,username,password,rol,email,estado) VALUES (?,?,?,?,?,?,?)')
      .run(prof.campus_id, prof.nombre, username, hash, 'docente', prof.email||null, 'activo');
    db.prepare('UPDATE profesores SET usuario_id=? WHERE id=?').run(r.lastInsertRowid, req.params.id);
    log(req.user.id,'CREAR_CUENTA_PROF',`${prof.nombre} → ${username}`,'success', prof.campus_id);
    res.json({id:r.lastInsertRowid, mensaje:`Cuenta creada: ${username}`});
  } catch(e) {
    if (e.message.includes('UNIQUE')) return res.status(400).json({error:'Ese nombre de usuario ya existe'});
    res.status(500).json({error:e.message});
  }
});

// ═══════════════════════════════════════════════════
//  GRUPOS
// ═══════════════════════════════════════════════════
app.get('/api/grupos', auth(), (req,res) => {
  const ids = campusAutorizados(req.user);
  let q = "SELECT g.*, c.nombre as campus_nombre, COUNT(DISTINCT a.id) as total_alumnos FROM grupos g LEFT JOIN campus c ON c.id=g.campus_id LEFT JOIN alumnos a ON a.grupo_id=g.id AND a.estado='activo' WHERE g.activo=1";
  const params = [];
  if (ids) { q+=` AND g.campus_id IN (${ids.map(()=>'?').join(',')})`; params.push(...ids); }
  q+=' GROUP BY g.id ORDER BY c.nombre, g.nombre';
  res.json(db.prepare(q).all(...params));
});

app.post('/api/grupos', auth(['superadmin','director']), (req,res) => {
  const {nombre,turno,carrera,semestre,capacidad,campus_id} = req.body;
  let cid = campus_id || req.user.campus_id;
  if (!cid) cid = primerCampusId();
  try {
    const r = db.prepare('INSERT INTO grupos (campus_id,nombre,turno,carrera,semestre,capacidad) VALUES (?,?,?,?,?,?)').run(cid,nombre,turno||'Matutino',carrera||null,semestre||1,capacidad||30);
    res.json({id:r.lastInsertRowid});
  } catch(e) { res.status(400).json({error:e.message}); }
});

app.put('/api/grupos/:id', auth(['superadmin','director']), (req,res) => {
  const {nombre,turno,carrera,semestre,capacidad,activo} = req.body;
  db.prepare('UPDATE grupos SET nombre=?,turno=?,carrera=?,semestre=?,capacidad=?,activo=? WHERE id=?').run(nombre,turno,carrera||null,semestre,capacidad,activo??1,req.params.id);
  res.json({ok:true});
});

app.delete('/api/grupos/:id', auth(['superadmin','director']), (req,res) => {
  db.prepare('UPDATE grupos SET activo=0 WHERE id=?').run(req.params.id);
  res.json({ok:true});
});

// ═══════════════════════════════════════════════════
//  MATERIAS
// ═══════════════════════════════════════════════════
app.get('/api/materias', auth(), (req,res) => {
  const esDocente = req.user.rol === 'docente';
  if (esDocente) {
    const prof = db.prepare('SELECT id FROM profesores WHERE usuario_id=?').get(req.user.id);
    return res.json(db.prepare("SELECT m.*, p.nombre as profesor_nombre FROM materias m LEFT JOIN profesores p ON p.id=m.profesor_id WHERE m.profesor_id=? ORDER BY m.codigo").all(prof?.id||-1));
  }
  const ids = campusAutorizados(req.user);
  let q = "SELECT m.*, p.nombre as profesor_nombre, c.nombre as campus_nombre FROM materias m LEFT JOIN profesores p ON p.id=m.profesor_id LEFT JOIN campus c ON c.id=m.campus_id WHERE 1=1";
  const params = [];
  if (ids) { q+=` AND m.campus_id IN (${ids.map(()=>'?').join(',')})`; params.push(...ids); }
  q+=' ORDER BY m.codigo';
  res.json(db.prepare(q).all(...params));
});

app.get('/api/materias/codigo/:codigo', auth(), (req,res) => {
  const cid = req.user.campus_id;
  const m = db.prepare('SELECT * FROM materias WHERE codigo=? AND (campus_id=? OR ? IS NULL)').get(req.params.codigo.toUpperCase(),cid,cid);
  if (!m) return res.status(404).json({error:'No encontrada'});
  res.json(m);
});

app.post('/api/materias', auth(['superadmin','director']), (req,res) => {
  const {codigo,nombre,creditos,horas_semana,profesor_id,campus_id,catalogo_id} = req.body;
  let cid = req.user.rol==='superadmin'?(campus_id||req.user.campus_id):req.user.campus_id;
  if (!cid) cid = primerCampusId();
  try {
    const r = db.prepare('INSERT INTO materias (campus_id,catalogo_id,codigo,nombre,creditos,horas_semana,profesor_id) VALUES (?,?,?,?,?,?,?)').run(cid,catalogo_id||null,codigo.toUpperCase(),nombre,creditos||4,horas_semana||4,profesor_id||null);
    log(req.user.id,'CREAR_MATERIA',`${codigo} - ${nombre}`,'success',cid);
    res.json({id:r.lastInsertRowid});
  } catch(e) { res.status(400).json({error:e.message.includes('UNIQUE')?'Código ya existe en este campus':e.message}); }
});

app.put('/api/materias/:id', auth(['superadmin','director']), (req,res) => {
  const {codigo,nombre,creditos,horas_semana,profesor_id} = req.body;
  db.prepare('UPDATE materias SET codigo=?,nombre=?,creditos=?,horas_semana=?,profesor_id=? WHERE id=?').run(codigo?.toUpperCase(),nombre,creditos,horas_semana,profesor_id||null,req.params.id);
  res.json({ok:true});
});

app.delete('/api/materias/:id', auth(['superadmin','director']), (req,res) => {
  db.prepare('DELETE FROM materias WHERE id=?').run(req.params.id);
  res.json({ok:true});
});

app.get('/api/catalogo-materias', auth(), (req,res) => {
  res.json(db.prepare('SELECT * FROM catalogo_materias ORDER BY area, codigo').all());
});

app.get('/api/materias/:id/horarios', auth(), (req,res) => {
  res.json(db.prepare("SELECT h.*, g.nombre as grupo_nombre FROM horarios_materia h LEFT JOIN grupos g ON g.id=h.grupo_id WHERE h.materia_id=? ORDER BY h.dia_semana, h.hora_ini").all(req.params.id));
});

app.post('/api/materias/:id/horarios', auth(['superadmin','director']), (req,res) => {
  const {grupo_id,dia_semana,hora_ini,hora_fin,aula} = req.body;
  try {
    const r = db.prepare('INSERT INTO horarios_materia (materia_id,grupo_id,dia_semana,hora_ini,hora_fin,aula) VALUES (?,?,?,?,?,?)').run(req.params.id,grupo_id,dia_semana,hora_ini,hora_fin,aula||null);
    res.json({id:r.lastInsertRowid});
  } catch { res.status(400).json({error:'Ya existe ese horario'}); }
});

app.delete('/api/horarios/:id', auth(['superadmin','director']), (req,res) => {
  db.prepare('DELETE FROM horarios_materia WHERE id=?').run(req.params.id);
  res.json({ok:true});
});

// Materias del docente — siempre devuelve { materias, cuatriActivo }
app.get('/api/mis-materias', auth(['docente']), (req,res) => {
  let prof = db.prepare('SELECT id FROM profesores WHERE usuario_id=?').get(req.user.id);
  if (!prof) {
    try {
      const u = db.prepare('SELECT * FROM usuarios WHERE id=?').get(req.user.id);
      const cid = u?.campus_id || primerCampusId();
      const r = db.prepare('INSERT INTO profesores (campus_id,usuario_id,nombre,email,estado) VALUES (?,?,?,?,?)').run(cid,req.user.id,u?.nombre||req.user.nombre,u?.email||null,'activo');
      prof = {id:r.lastInsertRowid};
    } catch { return res.json({materias:[],cuatriActivo:null}); }
  }
  const campusId = req.user.campus_id;
  const cuatriActivo = campusId ? db.prepare('SELECT id, nombre FROM cuatrimestres WHERE campus_id=? AND activo=1').get(campusId) : null;
  let materias;
  if (cuatriActivo) {
    materias = db.prepare(`SELECT m.*, p.nombre as profesor_nombre, (SELECT GROUP_CONCAT(dia_semana||':'||hora_ini||'-'||hora_fin||':'||COALESCE(aula,''),'|') FROM horarios_materia WHERE materia_id=m.id) as horarios_str, ? as cuatrimestre_nombre, CASE WHEN mc.materia_id IS NOT NULL THEN 1 ELSE 0 END as en_cuatrimestre_activo FROM materias m LEFT JOIN profesores p ON p.id=m.profesor_id LEFT JOIN materia_cuatrimestre mc ON mc.materia_id=m.id AND mc.cuatrimestre_id=? WHERE m.profesor_id=? GROUP BY m.id ORDER BY en_cuatrimestre_activo DESC, m.codigo`).all(cuatriActivo.nombre,cuatriActivo.id,prof.id);
  } else {
    materias = db.prepare(`SELECT m.*, p.nombre as profesor_nombre, (SELECT GROUP_CONCAT(dia_semana||':'||hora_ini||'-'||hora_fin||':'||COALESCE(aula,''),'|') FROM horarios_materia WHERE materia_id=m.id) as horarios_str, NULL as cuatrimestre_nombre, 0 as en_cuatrimestre_activo FROM materias m LEFT JOIN profesores p ON p.id=m.profesor_id WHERE m.profesor_id=? GROUP BY m.id ORDER BY m.codigo`).all(prof.id);
  }
  res.json({materias, cuatriActivo: cuatriActivo||null});
});

// ═══════════════════════════════════════════════════
//  ALUMNOS
// ═══════════════════════════════════════════════════
app.get('/api/alumnos', auth(), (req,res) => {
  const {grupoId} = req.query;
  const esDocente = req.user.rol==='docente';
  if (esDocente) {
    const prof = db.prepare('SELECT id FROM profesores WHERE usuario_id=?').get(req.user.id);
    const pid  = prof?.id||-1;
    let q = "SELECT DISTINCT a.*, g.nombre as grupo_nombre FROM alumnos a LEFT JOIN grupos g ON g.id=a.grupo_id JOIN asistencias asi ON asi.alumno_id=a.id JOIN materias m ON m.id=asi.materia_id WHERE m.profesor_id=? AND a.estado='activo'";
    const params = [pid];
    if (grupoId){q+=' AND a.grupo_id=?';params.push(grupoId);}
    return res.json(db.prepare(q+' ORDER BY a.nombre').all(...params));
  }
  const ids = campusAutorizados(req.user);
  let q = "SELECT a.*, g.nombre as grupo_nombre, c.nombre as campus_nombre FROM alumnos a LEFT JOIN grupos g ON g.id=a.grupo_id LEFT JOIN campus c ON c.id=a.campus_id WHERE 1=1";
  const params = [];
  if (ids) { q+=` AND a.campus_id IN (${ids.map(()=>'?').join(',')})`; params.push(...ids); }
  if (grupoId){q+=' AND a.grupo_id=?';params.push(grupoId);}
  res.json(db.prepare(q+' ORDER BY a.nombre').all(...params));
});

app.post('/api/alumnos', auth(['superadmin','director']), (req,res) => {
  const {matricula,nombre,email,telefono,grupo_id,tutor,tel_tutor,estado,campus_id} = req.body;
  let cid = req.user.rol==='superadmin'?(campus_id||req.user.campus_id):req.user.campus_id;
  if (!cid) cid = primerCampusId();
  try {
    const r = db.prepare('INSERT INTO alumnos (campus_id,matricula,nombre,email,telefono,grupo_id,tutor,tel_tutor,estado) VALUES (?,?,?,?,?,?,?,?,?)').run(cid,matricula,nombre,email||null,telefono||null,grupo_id||null,tutor||null,tel_tutor||null,estado||'activo');
    log(req.user.id,'CREAR_ALUMNO',nombre,'success',cid);
    res.json({id:r.lastInsertRowid});
  } catch { res.status(400).json({error:'Matrícula ya existe'}); }
});

app.put('/api/alumnos/:id', auth(['superadmin','director']), (req,res) => {
  const {matricula,nombre,email,telefono,grupo_id,tutor,tel_tutor,estado} = req.body;
  db.prepare('UPDATE alumnos SET matricula=?,nombre=?,email=?,telefono=?,grupo_id=?,tutor=?,tel_tutor=?,estado=? WHERE id=?').run(matricula,nombre,email||null,telefono||null,grupo_id||null,tutor||null,tel_tutor||null,estado,req.params.id);
  res.json({ok:true});
});

app.delete('/api/alumnos/:id', auth(['superadmin','director']), (req,res) => {
  db.prepare("UPDATE alumnos SET estado='baja' WHERE id=?").run(req.params.id);
  res.json({ok:true});
});

app.post('/api/alumnos/asignar-grupo', auth(['superadmin','director']), (req,res) => {
  const {alumnoIds, grupoId} = req.body;
  if (!Array.isArray(alumnoIds) || !alumnoIds.length) return res.status(400).json({error:'Sin alumnos seleccionados'});
  const upd = db.prepare('UPDATE alumnos SET grupo_id=? WHERE id=?');
  db.transaction(()=>alumnoIds.forEach(id=>upd.run(grupoId,id)))();
  res.json({ok:true, asignados:alumnoIds.length});
});

app.post('/api/alumnos/asignar-materia', auth(['superadmin','director']), (req,res) => {
  const {alumnoIds, materiaIds} = req.body;
  if (!Array.isArray(alumnoIds) || !Array.isArray(materiaIds)) return res.status(400).json({error:'Datos inválidos'});
  const ins = db.prepare('INSERT OR IGNORE INTO alumno_materia (alumno_id,materia_id) VALUES (?,?)');
  let total = 0;
  db.transaction(()=>{ alumnoIds.forEach(aid=>materiaIds.forEach(mid=>{ ins.run(aid,mid); total++; })); })();
  res.json({ok:true, asignaciones:total});
});

app.post('/api/alumnos/importar-csv', auth(['superadmin','director']), (req,res) => {
  const {alumnos, grupoId} = req.body;
  if (!Array.isArray(alumnos)) return res.status(400).json({error:'Datos inválidos'});
  let cid = req.user.campus_id || primerCampusId();
  const ins = db.prepare('INSERT OR IGNORE INTO alumnos (campus_id,matricula,nombre,email,grupo_id) VALUES (?,?,?,?,?)');
  let importados = 0;
  db.transaction(()=>alumnos.forEach(a=>{ try{ ins.run(cid,a.matricula,a.nombre,a.email||null,grupoId||null); importados++; }catch{} }))();
  log(req.user.id,'IMPORTAR_CSV',`${importados} alumnos importados`,'success',cid);
  res.json({ok:true, importados});
});

// ═══════════════════════════════════════════════════
//  PASE DE LISTA / ASISTENCIAS
// ═══════════════════════════════════════════════════
app.get('/api/asistencias/lista', auth(), (req,res) => {
  const {materiaId,grupoId,fecha} = req.query;
  if (!materiaId || !grupoId) return res.status(400).json({error:'Faltan parámetros'});
  const f = fecha||fechaLocal(0);
  const alumnos   = db.prepare("SELECT a.id, a.matricula, a.nombre FROM alumnos a WHERE a.grupo_id=? AND a.estado='activo' ORDER BY a.nombre").all(grupoId);
  const registros = db.prepare('SELECT alumno_id, status, nota FROM asistencias WHERE materia_id=? AND grupo_id=? AND fecha=?').all(materiaId,grupoId,f);
  const map = {};
  registros.forEach(r=>map[r.alumno_id]={status:r.status,nota:r.nota||''});
  const horarios = db.prepare('SELECT dia_semana, hora_ini, hora_fin, aula FROM horarios_materia WHERE materia_id=? AND (grupo_id=? OR grupo_id IS NULL) ORDER BY dia_semana, hora_ini').all(materiaId,grupoId);
  res.json({alumnos, registros:map, fecha:f, horarios});
});

app.post('/api/asistencias', auth(), (req,res) => {
  const {materiaId,grupoId,fecha,lista} = req.body;
  if (!Array.isArray(lista)) return res.status(400).json({error:'Lista inválida'});
  const ins = db.prepare('INSERT OR REPLACE INTO asistencias (alumno_id,materia_id,grupo_id,docente_id,campus_id,fecha,status,nota) VALUES (?,?,?,?,?,?,?,?)');
  const cid = req.user.campus_id;
  db.transaction(()=>lista.forEach(r=>ins.run(r.alumnoId,materiaId,grupoId,req.user.id,cid,fecha,r.status,r.nota||null)))();
  log(req.user.id,'ASISTENCIA',`Materia ${materiaId} · ${fecha} · ${lista.length} alumnos`,'success',cid);
  res.json({ok:true, guardados:lista.length});
});

app.get('/api/asistencias/reporte', auth(), (req,res) => {
  const {materiaId,grupoId,fechaIni,fechaFin} = req.query;
  const esDocente = req.user.rol==='docente';
  const ids = campusAutorizados(req.user);
  let where = 'WHERE a.fecha BETWEEN ? AND ?';
  const params = [fechaIni||fechaLocal(30), fechaFin||fechaLocal(0)];
  if (materiaId){ where+=' AND a.materia_id=?'; params.push(materiaId); }
  if (grupoId)  { where+=' AND a.grupo_id=?';   params.push(grupoId);   }
  if (ids)      { where+=` AND a.campus_id IN (${ids.map(()=>'?').join(',')})`; params.push(...ids); }
  if (esDocente){ const prof=db.prepare('SELECT id FROM profesores WHERE usuario_id=?').get(req.user.id); where+=` AND EXISTS(SELECT 1 FROM materias m WHERE m.id=a.materia_id AND m.profesor_id=${prof?.id||-1})`; }
  const rows = db.prepare(`SELECT al.matricula, al.nombre, SUM(CASE WHEN a.status='P' THEN 1 ELSE 0 END) as presentes, SUM(CASE WHEN a.status='T' THEN 1 ELSE 0 END) as tardanzas, SUM(CASE WHEN a.status='A' THEN 1 ELSE 0 END) as ausencias, SUM(CASE WHEN a.status='J' THEN 1 ELSE 0 END) as justificadas, COUNT(*) as total FROM asistencias a JOIN alumnos al ON al.id=a.alumno_id ${where} GROUP BY a.alumno_id ORDER BY al.nombre`).all(...params);
  const filas = rows.map(r=>({...r, pct:r.total?Math.round((r.presentes+r.tardanzas)/r.total*100):0}));
  const tot = {presentes:0,tardanzas:0,ausencias:0,justificadas:0,total:0};
  filas.forEach(r=>{tot.presentes+=r.presentes;tot.tardanzas+=r.tardanzas;tot.ausencias+=r.ausencias;tot.justificadas+=r.justificadas;tot.total+=r.total;});
  res.json({filas, totales:tot});
});

// ═══════════════════════════════════════════════════
//  CUATRIMESTRES
// ═══════════════════════════════════════════════════
app.get('/api/cuatrimestres', auth(), (req,res) => {
  const ids = campusAutorizados(req.user);
  let q = "SELECT c.*, ca.nombre as campus_nombre, COUNT(mc.materia_id) as total_materias FROM cuatrimestres c LEFT JOIN campus ca ON ca.id=c.campus_id LEFT JOIN materia_cuatrimestre mc ON mc.cuatrimestre_id=c.id WHERE 1=1";
  const params = [];
  if (ids) { q+=` AND c.campus_id IN (${ids.map(()=>'?').join(',')})`; params.push(...ids); }
  q+=' GROUP BY c.id ORDER BY c.anio DESC, c.numero ASC';
  res.json(db.prepare(q).all(...params));
});

app.post('/api/cuatrimestres', auth(['superadmin','director']), (req,res) => {
  const {numero,anio,nombre,fecha_ini,fecha_fin,campus_id} = req.body;
  let cid = req.user.rol==='superadmin'?(campus_id||req.user.campus_id):req.user.campus_id;
  if (!cid) cid = primerCampusId();
  try {
    const r = db.prepare('INSERT INTO cuatrimestres (campus_id,numero,anio,nombre,fecha_ini,fecha_fin) VALUES (?,?,?,?,?,?)').run(cid,numero,anio,nombre||`Cuatrimestre ${numero} — ${anio}`,fecha_ini,fecha_fin);
    res.json({id:r.lastInsertRowid});
  } catch { res.status(400).json({error:'Ya existe ese cuatrimestre para este campus'}); }
});

app.put('/api/cuatrimestres/:id/activar', auth(['superadmin','director']), (req,res) => {
  const c = db.prepare('SELECT * FROM cuatrimestres WHERE id=?').get(req.params.id);
  if (!c) return res.status(404).json({error:'No encontrado'});
  db.prepare('UPDATE cuatrimestres SET activo=0 WHERE campus_id=?').run(c.campus_id);
  db.prepare('UPDATE cuatrimestres SET activo=1 WHERE id=?').run(req.params.id);
  log(req.user.id,'ACTIVAR_CUATRIMESTRE',c.nombre,'success',c.campus_id);
  res.json({ok:true});
});

app.post('/api/cuatrimestres/:id/materias', auth(['superadmin','director']), (req,res) => {
  const {materiaIds} = req.body;
  if (!Array.isArray(materiaIds)) return res.status(400).json({error:'Datos inválidos'});
  const ins = db.prepare('INSERT OR IGNORE INTO materia_cuatrimestre (materia_id,cuatrimestre_id) VALUES (?,?)');
  db.transaction(()=>materiaIds.forEach(mid=>ins.run(mid,req.params.id)))();
  res.json({ok:true, asignadas:materiaIds.length});
});

app.get('/api/cuatrimestres/:id/materias', auth(), (req,res) => {
  res.json(db.prepare("SELECT m.*, p.nombre as profesor_nombre FROM materia_cuatrimestre mc JOIN materias m ON m.id=mc.materia_id LEFT JOIN profesores p ON p.id=m.profesor_id WHERE mc.cuatrimestre_id=? ORDER BY m.codigo").all(req.params.id));
});

// ═══════════════════════════════════════════════════
//  FALLBACK → SPA
// ═══════════════════════════════════════════════════
app.get('/{*path}', (req,res) => {
  res.sendFile(path.join(__dirname,'../client/index.html'));
});

// Manejador global de errores
app.use((err, req, res, next) => {
  console.error('Error del servidor:', err.message);
  res.status(500).json({error: 'Error interno del servidor'});
});

app.listen(PORT, () => {
  console.log(`\n Assisto · UNITEC corriendo en http://localhost:${PORT}`);
  console.log('   superadmin / admin123  →  Super Admin (todos los campus)');
  console.log('   director1  / dir123    →  Director Campus Marina');
  console.log('   director2  / dir456    →  Director Campus Cuitláhuac');
  console.log('   docente1   / doc123    →  Docente\n');
});
