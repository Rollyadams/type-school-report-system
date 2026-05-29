import Dexie from 'dexie';

export const offlineDB = new Dexie('AttendAI');

offlineDB.version(1).stores({
  queue:            '++id, table, status, created_at',
  students_cache:   'id, school_id, class_id',
  classes_cache:    'id, school_id',
  terms_cache:      'id, school_id',
  results_cache:    'id, student_id, term_id',
  attendance_cache: 'id, student_id, term_id',
  daily_att_cache:  'id, student_id, class_id, date',
});
