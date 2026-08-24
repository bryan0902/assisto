const Database = require('better-sqlite3');
const bcrypt   = require('bcryptjs');
const path     = require('path');
const fs       = require('fs');

const DB_PATH = path.join(__dirname, '../../data/assisto.db');
const DB_VERSION = 4; // Incrementar para forzar recreación de BD
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function fechaLocal(offsetDias = 0) {
  const d = new Date(); d.setDate(d.getDate() - offsetDias);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

// ═══════════════════════════════════════════════════
//  SCHEMA COMPLETO
// ═══════════════════════════════════════════════════
db.exec(`
  -- ── CAMPUS / INSTITUCIONES ──────────────────────
  CREATE TABLE IF NOT EXISTS campus (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre      TEXT NOT NULL,
    clave       TEXT UNIQUE NOT NULL,
    direccion   TEXT, telefono TEXT, email TEXT,
    ciudad      TEXT, estado_rep TEXT,
    director_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    activo      INTEGER DEFAULT 1,
    creado      TEXT DEFAULT (datetime('now','localtime'))
  );

  -- ── PERMISOS DE CAMPUS POR DIRECTOR ──────────────
  -- Permite que un director vea múltiples campus si el SA lo autoriza
  CREATE TABLE IF NOT EXISTS director_campus (
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    campus_id  INTEGER NOT NULL REFERENCES campus(id)  ON DELETE CASCADE,
    autorizado_por INTEGER REFERENCES usuarios(id),
    creado     TEXT DEFAULT (datetime('now','localtime')),
    PRIMARY KEY(usuario_id, campus_id)
  );

  -- ── CUATRIMESTRES ────────────────────────────────
  CREATE TABLE IF NOT EXISTS cuatrimestres (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    campus_id INTEGER REFERENCES campus(id) ON DELETE CASCADE,
    numero    INTEGER NOT NULL CHECK(numero IN (1,2,3)),
    anio      INTEGER NOT NULL,
    nombre    TEXT NOT NULL,
    fecha_ini TEXT NOT NULL,
    fecha_fin TEXT NOT NULL,
    activo    INTEGER DEFAULT 0,
    creado    TEXT DEFAULT (datetime('now','localtime')),
    UNIQUE(campus_id, numero, anio)
  );

  -- ── USUARIOS ─────────────────────────────────────
  CREATE TABLE IF NOT EXISTS usuarios (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    campus_id INTEGER REFERENCES campus(id) ON DELETE SET NULL,
    nombre    TEXT NOT NULL,
    username  TEXT UNIQUE NOT NULL,
    password  TEXT NOT NULL,
    rol       TEXT NOT NULL CHECK(rol IN ('superadmin','director','docente')),
    email     TEXT, telefono TEXT,
    estado    TEXT DEFAULT 'activo' CHECK(estado IN ('activo','inactivo')),
    creado    TEXT DEFAULT (datetime('now','localtime')),
    ultimo_acceso TEXT
  );

  -- ── PROFESORES ───────────────────────────────────
  CREATE TABLE IF NOT EXISTS profesores (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    campus_id  INTEGER REFERENCES campus(id) ON DELETE SET NULL,
    usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
    nombre     TEXT NOT NULL,
    email      TEXT, telefono TEXT,
    cedula     TEXT, especialidad TEXT,
    estado     TEXT DEFAULT 'activo' CHECK(estado IN ('activo','inactivo')),
    creado     TEXT DEFAULT (datetime('now','localtime'))
  );

  -- ── CATÁLOGO DE MATERIAS (compartido) ────────────
  CREATE TABLE IF NOT EXISTS catalogo_materias (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo   TEXT UNIQUE NOT NULL,
    nombre   TEXT NOT NULL,
    creditos INTEGER DEFAULT 4,
    horas_semana INTEGER DEFAULT 4,
    area     TEXT,
    creado   TEXT DEFAULT (datetime('now','localtime'))
  );

  -- ── MATERIAS POR CAMPUS (instancia del catálogo) ─
  CREATE TABLE IF NOT EXISTS materias (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    campus_id    INTEGER NOT NULL REFERENCES campus(id) ON DELETE CASCADE,
    catalogo_id  INTEGER REFERENCES catalogo_materias(id) ON DELETE SET NULL,
    codigo       TEXT NOT NULL,
    nombre       TEXT NOT NULL,
    creditos     INTEGER DEFAULT 4,
    horas_semana INTEGER DEFAULT 4,
    profesor_id  INTEGER REFERENCES profesores(id) ON DELETE SET NULL,
    creado       TEXT DEFAULT (datetime('now','localtime')),
    UNIQUE(campus_id, codigo)
  );

  -- ── HORARIOS DE MATERIA ──────────────────────────
  -- Cada fila = un bloque horario (ej: Lunes 08:00-10:00)
  CREATE TABLE IF NOT EXISTS horarios_materia (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    materia_id INTEGER NOT NULL REFERENCES materias(id) ON DELETE CASCADE,
    grupo_id   INTEGER REFERENCES grupos(id) ON DELETE CASCADE,
    dia_semana INTEGER NOT NULL CHECK(dia_semana BETWEEN 1 AND 5),
    -- 1=Lunes 2=Martes 3=Miércoles 4=Jueves 5=Viernes
    hora_ini   TEXT NOT NULL,  -- formato HH:MM
    hora_fin   TEXT NOT NULL,
    aula       TEXT,
    UNIQUE(materia_id, grupo_id, dia_semana, hora_ini)
  );

  -- ── GRUPOS ───────────────────────────────────────
  CREATE TABLE IF NOT EXISTS grupos (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    campus_id INTEGER NOT NULL REFERENCES campus(id) ON DELETE CASCADE,
    nombre    TEXT NOT NULL,
    turno     TEXT DEFAULT 'Matutino' CHECK(turno IN ('Matutino','Vespertino','Nocturno')),
    carrera   TEXT,
    semestre  INTEGER DEFAULT 1,
    capacidad INTEGER DEFAULT 30,
    activo    INTEGER DEFAULT 1,
    creado    TEXT DEFAULT (datetime('now','localtime'))
  );

  -- ── MATERIA_CUATRIMESTRE ─────────────────────────
  CREATE TABLE IF NOT EXISTS materia_cuatrimestre (
    materia_id      INTEGER REFERENCES materias(id) ON DELETE CASCADE,
    cuatrimestre_id INTEGER REFERENCES cuatrimestres(id) ON DELETE CASCADE,
    PRIMARY KEY(materia_id, cuatrimestre_id)
  );

  -- ── ALUMNO-MATERIA ───────────────────────────────
  CREATE TABLE IF NOT EXISTS alumno_materia (
    alumno_id  INTEGER REFERENCES alumnos(id) ON DELETE CASCADE,
    materia_id INTEGER REFERENCES materias(id) ON DELETE CASCADE,
    PRIMARY KEY(alumno_id, materia_id)
  );

  -- ── ALUMNOS ──────────────────────────────────────
  CREATE TABLE IF NOT EXISTS alumnos (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    campus_id INTEGER REFERENCES campus(id) ON DELETE SET NULL,
    matricula TEXT UNIQUE NOT NULL,
    nombre    TEXT NOT NULL,
    email     TEXT, telefono TEXT,
    grupo_id  INTEGER REFERENCES grupos(id) ON DELETE SET NULL,
    tutor     TEXT, tel_tutor TEXT,
    estado    TEXT DEFAULT 'activo' CHECK(estado IN ('activo','inactivo','baja')),
    creado    TEXT DEFAULT (datetime('now','localtime'))
  );

  -- ── ASISTENCIAS ──────────────────────────────────
  CREATE TABLE IF NOT EXISTS asistencias (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    alumno_id  INTEGER NOT NULL REFERENCES alumnos(id) ON DELETE CASCADE,
    materia_id INTEGER NOT NULL REFERENCES materias(id) ON DELETE CASCADE,
    grupo_id   INTEGER NOT NULL REFERENCES grupos(id),
    docente_id INTEGER REFERENCES usuarios(id),
    campus_id  INTEGER REFERENCES campus(id),
    fecha      TEXT NOT NULL,
    status     TEXT NOT NULL CHECK(status IN ('P','T','A','J')),
    nota       TEXT,
    registrado TEXT DEFAULT (datetime('now','localtime')),
    UNIQUE(alumno_id, materia_id, fecha)
  );

  -- ── LOG DE ACTIVIDAD ─────────────────────────────
  CREATE TABLE IF NOT EXISTS actividad_log (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario_id INTEGER REFERENCES usuarios(id),
    campus_id  INTEGER REFERENCES campus(id),
    accion     TEXT NOT NULL,
    detalle    TEXT,
    tipo       TEXT DEFAULT 'info',
    fecha      TEXT DEFAULT (datetime('now','localtime'))
  );

  -- ── ÍNDICES ───────────────────────────────────────
  CREATE INDEX IF NOT EXISTS idx_asist_fecha    ON asistencias(fecha);
  CREATE INDEX IF NOT EXISTS idx_asist_materia  ON asistencias(materia_id);
  CREATE INDEX IF NOT EXISTS idx_asist_alumno   ON asistencias(alumno_id);
  CREATE INDEX IF NOT EXISTS idx_asist_campus   ON asistencias(campus_id);
  CREATE INDEX IF NOT EXISTS idx_alumnos_grupo  ON alumnos(grupo_id);
  CREATE INDEX IF NOT EXISTS idx_alumnos_campus ON alumnos(campus_id);
  CREATE INDEX IF NOT EXISTS idx_materias_campus ON materias(campus_id);
  CREATE INDEX IF NOT EXISTS idx_grupos_campus   ON grupos(campus_id);
  CREATE INDEX IF NOT EXISTS idx_horarios_mat    ON horarios_materia(materia_id);
`);

// ═══════════════════════════════════════════════════
//  SEED
// ═══════════════════════════════════════════════════
function seedData() {
  const existe = db.prepare("SELECT id FROM usuarios WHERE username = 'superadmin'").get();
  if (existe) return;

  const hash = p => bcrypt.hashSync(p, 10);

  // ── Campus ─────────────────────────────────
  const campus = [
    	['Campus Norte',   'NORTE',   'Av. Principal 100, Ciudad Demo',  '55-5000-0001', 'norte@instituto-demo.edu',   'Ciudad Demo', 'Estado Demo'],
	['Campus Centro',  'CENTRO',  'Calle Central 200, Ciudad Demo',  '55-5000-0002', 'centro@instituto-demo.edu',  'Ciudad Demo', 'Estado Demo'],
	['Campus Sur',     'SUR',     'Blvd. Sur 300, Ciudad Demo',      '55-5000-0003', 'sur@instituto-demo.edu',     'Ciudad Demo', 'Estado Demo'],
	['Campus Oriente', 'ORIENTE', 'Av. Oriente 400, Ciudad Demo',    '55-5000-0004', 'oriente@instituto-demo.edu', 'Ciudad Demo', 'Estado Demo'],
  ];
  const insCampus = db.prepare(`INSERT INTO campus (nombre,clave,direccion,telefono,email,ciudad,estado_rep) VALUES (?,?,?,?,?,?,?)`);
  campus.forEach(c => insCampus.run(...c));

  // ── Usuarios ─────────────────────────────────────
  const users = [
    [null,  'Super Administrador','superadmin','admin123','superadmin','superadmin@instituto-demo.edu'],
    [1,     'Dra. Patricia Ramírez',     'director1', 'dir123',  'director',  'pramirez@instituto-demo.edu'],
    [2,     'Lic. Roberto Solis',        'director2', 'dir456',  'director',  'rsolis@instituto-demo.edu'],
    [1,     'Ing. Carlos Mendoza',       'docente1',  'doc123',  'docente',   'cmendoza@instituto-demo.edu'],
    [1,     'M.C. Laura Torres',         'docente2',  'doc456',  'docente',   'ltorres@instituto-demo.edu'],
    [1,     'Dr. José García',           'docente3',  'doc789',  'docente',   'jgarcia@instituto-demo.edu'],
    [2,     'Ing. Ana Pérez',            'docente4',  'doc321',  'docente',   'aperez@instituto-demo.edu'],
  ];
  const insUser = db.prepare(`INSERT INTO usuarios (campus_id,nombre,username,password,rol,email) VALUES (?,?,?,?,?,?)`);
  users.forEach(([cid,nombre,user,pass,rol,email]) => insUser.run(cid, nombre, user, hash(pass), rol, email));

  // ── Profesores ───────────────────────────────────
  const profs = [
    [1, 4, 'Ing. Carlos Mendoza','cmendoza@instituto-demo.edu','55-100-0001','C1234567','Ingeniería en Sistemas'],
    [1, 5, 'M.C. Laura Torres',  'ltorres@instituto-demo.edu', '55-100-0002','C2345678','Redes y Comunicaciones'],
    [1, 6, 'Dr. José García',    'jgarcia@instituto-demo.edu', '55-100-0003','C3456789','Matemáticas Aplicadas'],
    [2, 7, 'Ing. Ana Pérez',     'aperez@instituto-demo.edu',  '55-100-0004','C4567890','Administración'],
  ];
  const insProf = db.prepare(`INSERT INTO profesores (campus_id,usuario_id,nombre,email,telefono,cedula,especialidad) VALUES (?,?,?,?,?,?,?)`);
  profs.forEach(p => insProf.run(...p));

  // ── Catálogo de materias (compartido) ─────────────
  const catalogoMats = [
    ['SIS-301','Programación Avanzada',        5, 4, 'Sistemas'],
    ['SIS-302','Base de Datos',                4, 4, 'Sistemas'],
    ['SIS-303','Redes de Computadoras',        4, 4, 'Sistemas'],
    ['SIS-304','Ingeniería de Software',       4, 4, 'Sistemas'],
    ['IND-201','Investigación de Operaciones', 4, 4, 'Industrial'],
    ['MAT-101','Cálculo Diferencial',          5, 4, 'Matemáticas'],
    ['MEC-101','Fundamentos de Mecatrónica',   5, 4, 'Mecatrónica'],
    ['ADM-101','Administración de Empresas',   4, 4, 'Administración'],
    ['ADM-202','Contabilidad General',         4, 4, 'Administración'],
  ];
  const insCat = db.prepare(`INSERT INTO catalogo_materias (codigo,nombre,creditos,horas_semana,area) VALUES (?,?,?,?,?)`);
  catalogoMats.forEach(m => insCat.run(...m));

  // ── Materias campus 1 (Norte) ───────────────────
  const mats1 = [
    [1, 1, 'SIS-301','Programación Avanzada',        5, 4, 1],
    [1, 2, 'SIS-302','Base de Datos',                4, 4, 2],
    [1, 3, 'SIS-303','Redes de Computadoras',        4, 4, 2],
    [1, 4, 'SIS-304','Ingeniería de Software',       4, 4, 1],
    [1, 5, 'IND-201','Investigación de Operaciones', 4, 4, 3],
    [1, 6, 'MAT-101','Cálculo Diferencial',          5, 4, 3],
    [1, 7, 'MEC-101','Fundamentos de Mecatrónica',   5, 4, 1],
  ];
  const insMat = db.prepare(`INSERT INTO materias (campus_id,catalogo_id,codigo,nombre,creditos,horas_semana,profesor_id) VALUES (?,?,?,?,?,?,?)`);
  mats1.forEach(m => insMat.run(...m));

  // ── Materias campus 2 (Cuitláhuac) ───────────────
  const mats2 = [
    [2, 8, 'ADM-101','Administración de Empresas',4, 4, 4],
    [2, 9, 'ADM-202','Contabilidad General',      4, 4, 4],
    [2, 6, 'MAT-101','Cálculo Diferencial',       5, 4, null],
  ];
  mats2.forEach(m => insMat.run(...m));

  // ── Grupos campus 1 ──────────────────────────────
  const grupos1 = [
    [1,'3°A Sistemas',    'Matutino',  'Ingeniería en Sistemas Computacionales',3,35],
    [1,'3°B Sistemas',    'Vespertino','Ingeniería en Sistemas Computacionales',3,35],
    [1,'2°A Industrial',  'Matutino',  'Ingeniería Industrial',                 2,30],
    [1,'1°A Mecatrónica', 'Matutino',  'Ingeniería Mecatrónica',                1,32],
  ];
  const insGrp = db.prepare(`INSERT INTO grupos (campus_id,nombre,turno,carrera,semestre,capacidad) VALUES (?,?,?,?,?,?)`);
  grupos1.forEach(g => insGrp.run(...g));

  // ── Grupos campus 2 ──────────────────────────────
  const grupos2 = [
    [2,'1°A Administración','Matutino','Licenciatura en Administración',1,30],
    [2,'1°B Administración','Vespertino','Licenciatura en Administración',1,30],
  ];
  grupos2.forEach(g => insGrp.run(...g));

  // ── Horarios de materias (campus 1) ─────────────
  // Formato: materia_id, grupo_id, dia(1-5), hora_ini, hora_fin, aula
  const horarios = [
    [1, 1, 1, '08:00','10:00','Aula 301'], // SIS-301 Lunes
    [1, 1, 3, '08:00','10:00','Aula 301'], // SIS-301 Miércoles
    [2, 1, 2, '08:00','10:00','Lab BD'],   // SIS-302 Martes
    [2, 1, 4, '08:00','10:00','Lab BD'],   // SIS-302 Jueves
    [3, 2, 1, '16:00','18:00','Aula 201'], // SIS-303 Lunes
    [3, 2, 3, '16:00','18:00','Aula 201'], // SIS-303 Miércoles
    [5, 3, 2, '08:00','10:00','Aula 102'], // IND-201 Martes
    [5, 3, 4, '08:00','10:00','Aula 102'], // IND-201 Jueves
    [7, 4, 1, '08:00','10:00','Taller M'], // MEC-101 Lunes
    [7, 4, 3, '08:00','10:00','Taller M'], // MEC-101 Miércoles
  ];
  const insHor = db.prepare(`INSERT OR IGNORE INTO horarios_materia (materia_id,grupo_id,dia_semana,hora_ini,hora_fin,aula) VALUES (?,?,?,?,?,?)`);
  horarios.forEach(h => insHor.run(...h));

  // ── Alumnos campus 1 ─────────────────────────────
  const alumnos1 = [
    ['2021001','Ana García López',       'ana@edu.mx',    1,1],
    ['2021002','Luis Martínez Hernández','luis@edu.mx',   1,1],
    ['2021003','Sofía Rodríguez Pérez',  'sofia@edu.mx',  1,1],
    ['2021004','Miguel Ángel Flores',    'miguel@edu.mx', 1,1],
    ['2021005','Valeria Sánchez Cruz',   'valeria@edu.mx',1,1],
    ['2021006','Diego Ramírez Ortiz',    'diego@edu.mx',  1,2],
    ['2021007','Fernanda Torres Gil',    'fer@edu.mx',    1,2],
    ['2021008','Roberto López Vega',     'rober@edu.mx',  1,2],
    ['2022001','Camila Moreno Ruiz',     'cami@edu.mx',   1,3],
    ['2022002','Óscar Jiménez Castro',   'oscar@edu.mx',  1,3],
    ['2023001','Pablo Herrera Núñez',    'pablo@edu.mx',  1,4],
    ['2023002','Mariana Ortiz Campos',   'mari@edu.mx',   1,4],
    ['2023003','Andrés Fuentes Mora',    'andres@edu.mx', 1,4],
  ];
  const insAl = db.prepare(`INSERT INTO alumnos (matricula,nombre,email,campus_id,grupo_id) VALUES (?,?,?,?,?)`);
  alumnos1.forEach(a => insAl.run(...a));

  // ── Alumnos campus 2 ─────────────────────────────
  const alumnos2 = [
    ['2024001','Carmen Vega Torres',    'carmen@edu.mx',  2,5],
    ['2024002','Ramón Díaz Flores',     'ramon@edu.mx',   2,5],
    ['2024003','Patricia Leal Moreno',  'patricia@edu.mx',2,6],
  ];
  alumnos2.forEach(a => insAl.run(...a));

  // ── Cuatrimestres 2026 por campus ────────────────
  const insCuatri = db.prepare(`INSERT OR IGNORE INTO cuatrimestres (campus_id,numero,anio,nombre,fecha_ini,fecha_fin,activo) VALUES (?,?,?,?,?,?,?)`);
  [1,2,3,4].forEach(cid => {
    insCuatri.run(cid, 1, 2026, 'Cuatrimestre 1 — 2026', '2026-01-12', '2026-04-30', 1);
    insCuatri.run(cid, 2, 2026, 'Cuatrimestre 2 — 2026', '2026-05-04', '2026-08-28', 0);
    insCuatri.run(cid, 3, 2026, 'Cuatrimestre 3 — 2026', '2026-09-01', '2026-12-18', 0);
  });

  // ── Asistencias demo ──────────────────────────────
  const insAsist = db.prepare(`INSERT OR IGNORE INTO asistencias (alumno_id,materia_id,grupo_id,docente_id,campus_id,fecha,status) VALUES (?,?,?,?,?,?,?)`);
  const sts = ['P','P','P','P','P','T','A','J'];
  const grupoMat = { 1:[1,2], 2:[3,4], 3:[5,6], 4:[7] };

  for (let off = 20; off >= 0; off--) {
    const d = new Date(); d.setDate(d.getDate()-off);
    if (d.getDay()===0||d.getDay()===6) continue;
    const fecha = fechaLocal(off);
    alumnos1.forEach((_,ai) => {
      const aid = ai+1, gid = alumnos1[ai][4];
      (grupoMat[gid]||[]).forEach(mid => {
        insAsist.run(aid, mid, gid, 4, 1, fecha, sts[Math.floor(Math.random()*sts.length)]);
      });
    });
  }

  // ── Asignar directores a campus ─────────────────
  // director1 (id=2) → Campus Norte (id=1)
  // director2 (id=3) → Campus Cuitláhuac (id=2)
  db.prepare('UPDATE campus SET director_id=? WHERE id=?').run(2, 1);
  db.prepare('UPDATE campus SET director_id=? WHERE id=?').run(3, 2);

  // ── Permisos director_campus ──────────────────────
  const insDC = db.prepare('INSERT OR IGNORE INTO director_campus (usuario_id,campus_id,autorizado_por) VALUES (?,?,?)');
  insDC.run(2, 1, 1); // director1 → Marina (autorizado por superadmin)
  insDC.run(3, 2, 1); // director2 → Cuitláhuac
  // director1 también puede ver Campus Sur como ejemplo de multi-campus
  insDC.run(2, 3, 1);

  db.prepare(`INSERT INTO actividad_log (usuario_id,accion,detalle,tipo) VALUES (?,?,?,?)`)
    .run(1,'Sistema inicializado','Datos multi-campus cargados','success');

  console.log('Base de datos multi-campus inicializada.');
}

// ── Verificar/inicializar tablas nuevas en BD existente ─────────────
function migrateIfNeeded() {
  // Agregar columna director_id a campus si no existe
  try {
    db.prepare('SELECT director_id FROM campus LIMIT 1').get();
  } catch {
    try { db.prepare('ALTER TABLE campus ADD COLUMN director_id INTEGER').run(); } catch {}
  }
  // Crear tabla director_campus si no existe
  db.exec(`CREATE TABLE IF NOT EXISTS director_campus (
    usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    campus_id  INTEGER NOT NULL REFERENCES campus(id)  ON DELETE CASCADE,
    autorizado_por INTEGER REFERENCES usuarios(id),
    creado TEXT DEFAULT (datetime('now','localtime')),
    PRIMARY KEY(usuario_id, campus_id)
  )`);
  // Agregar campus_id a cuatrimestres si no existe
  try {
    db.prepare('SELECT campus_id FROM cuatrimestres LIMIT 1').get();
  } catch {
    try { db.prepare('ALTER TABLE cuatrimestres ADD COLUMN campus_id INTEGER').run(); } catch {}
  }
  // Asegurar que profesores tienen usuario_id linkado
  // Si hay docentes sin profesor record, crearlos
  const docentes = db.prepare("SELECT id, campus_id, nombre, email FROM usuarios WHERE rol='docente'").all();
  docentes.forEach(u => {
    const existe = db.prepare('SELECT id FROM profesores WHERE usuario_id=?').get(u.id);
    if (!existe) {
      try {
        db.prepare('INSERT INTO profesores (campus_id,usuario_id,nombre,email,estado) VALUES (?,?,?,?,?)')
          .run(u.campus_id||1, u.id, u.nombre, u.email||null, 'activo');
        console.log(`Profesor creado automáticamente para ${u.nombre}`);
      } catch(e) {}
    }
  });
  // Asegurar que todos los docentes tienen materias asignadas (si hay materias en su campus)
  // Esto lo dejamos manual para no sobrescribir asignaciones existentes
}

migrateIfNeeded();
seedData();
module.exports = db;
