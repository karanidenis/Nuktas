/**
 * Seed script — creates demo clinic, departments, and staff users.
 * Run: node db/seed.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── Clinic ──────────────────────────────────────────────────────────────
    const { rows: [clinic] } = await client.query(
      `INSERT INTO clinics (name, code, location, phone_number)
       VALUES ('Nairobi Central Clinic', 'NC', 'Nairobi, Kenya', '+254700000001')
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
       RETURNING *`
    );
    console.log(`Clinic: ${clinic.name} (${clinic.id})`);

    // ── Departments ─────────────────────────────────────────────────────────
    const depts = [
      { name: 'Emergency', code: 'EMRG', is_emergency: true,  avg_wait_time: 0  },
      { name: 'Internal Medicine',  code: 'INTM', is_emergency: false, avg_wait_time: 45 },
      { name: 'Pediatrics',         code: 'PED',  is_emergency: false, avg_wait_time: 30 },
      { name: 'Cardiology',         code: 'CARD', is_emergency: false, avg_wait_time: 60 },
      { name: 'OB/GYN',             code: 'OBGN', is_emergency: false, avg_wait_time: 40 },
      { name: 'Orthopedics',        code: 'ORTH', is_emergency: false, avg_wait_time: 50 },
      { name: 'ENT',                code: 'ENT',  is_emergency: false, avg_wait_time: 35 },
      { name: 'Dermatology',        code: 'DERM', is_emergency: false, avg_wait_time: 55 },
    ];

    const deptIds = {};
    for (const d of depts) {
      const { rows: [row] } = await client.query(
        `INSERT INTO departments (clinic_id, name, code, is_emergency, avg_wait_time, staff_available)
         VALUES ($1, $2, $3, $4, $5, 2)
         ON CONFLICT (clinic_id, code) DO UPDATE SET name = EXCLUDED.name
         RETURNING *`,
        [clinic.id, d.name, d.code, d.is_emergency, d.avg_wait_time]
      );
      deptIds[d.code] = row.id;
      console.log(`  Dept: ${row.name}`);
    }

    // ── Users ───────────────────────────────────────────────────────────────
    const users = [
      { name: 'Admin User',  email: 'admin@nairobi.clinic', password: 'password123', role: 'admin',  dept: null    },
      { name: 'Staff User',  email: 'staff@nairobi.clinic', password: 'password123', role: 'staff',  dept: 'INTM'  },
      { name: 'Dr. Wanjiru', email: 'doctor@nairobi.clinic',password: 'password123', role: 'doctor', dept: 'CARD'  },
    ];

    for (const u of users) {
      const hash = await bcrypt.hash(u.password, 10);
      const { rows: [row] } = await client.query(
        `INSERT INTO users (clinic_id, name, email, password_hash, role, department_id)
         VALUES ($1, $2, lower($3), $4, $5, $6)
         ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash
         RETURNING *`,
        [clinic.id, u.name, u.email, hash, u.role, u.dept ? deptIds[u.dept] : null]
      );
      console.log(`  User: ${row.email} (${row.role})`);
    }

    // ── Demo queue entries ───────────────────────────────────────────────────
    console.log('\nInserting demo queue entries...');

    const demoPatients = [
      { phone: '+254712100001', name: 'John Kamau Mwangi',      conditions: ['hypertension']    },
      { phone: '+254712100002', name: 'Grace Wanjiru Otieno',   conditions: ['diabetes']         },
      { phone: '+254712100003', name: 'Peter Ochieng Odhiambo', conditions: []                   },
      { phone: '+254712100004', name: 'Mary Akinyi Wekesa',     conditions: ['asthma']           },
      { phone: '+254712100005', name: 'David Kipchoge Cheruiyot', conditions: []                 },
      { phone: '+254712100006', name: 'Faith Njeri Wambui',     conditions: ['hypertension', 'diabetes'] },
    ];

    const demoEntries = [
      { patientIdx: 0, dept: 'EMRG', urgency: 'critical', complaint: 'Severe chest pain and shortness of breath', red_flag: true  },
      { patientIdx: 1, dept: 'CARD', urgency: 'high',     complaint: 'Irregular heartbeat, dizziness',            red_flag: false },
      { patientIdx: 2, dept: 'INTM', urgency: 'medium',   complaint: 'Persistent fever for 3 days, body aches',   red_flag: false },
      { patientIdx: 3, dept: 'PED',  urgency: 'medium',   complaint: 'Child with high fever and rash',            red_flag: false },
      { patientIdx: 4, dept: 'ENT',  urgency: 'low',      complaint: 'Ear pain and reduced hearing',              red_flag: false },
      { patientIdx: 5, dept: 'INTM', urgency: 'high',     complaint: 'Blood sugar very high, headache, fatigue',  red_flag: false },
    ];

    for (let i = 0; i < demoPatients.length; i++) {
      const dp = demoPatients[i];
      const { rows: [patient] } = await client.query(
        `INSERT INTO patients (phone_number, name, chronic_conditions, consent_given, visit_count)
         VALUES ($1, $2, $3, true, $4)
         ON CONFLICT (phone_number) DO UPDATE SET name = EXCLUDED.name
         RETURNING *`,
        [dp.phone, dp.name, dp.conditions, Math.floor(Math.random() * 5) + 1]
      );

      const de = demoEntries[i];
      const { rows: [call] } = await client.query(
        `INSERT INTO calls (patient_id, clinic_id, language_code, chief_complaint, urgency_tier,
                            recommended_department, red_flag_detected, consent_given, call_status,
                            symptoms, agent_summary)
         VALUES ($1,$2,'sw',$3,$4,$5,$6,true,'completed',$7,$8)
         RETURNING *`,
        [
          patient.id, clinic.id, de.complaint, de.urgency,
          depts.find(d => d.code === de.dept)?.name,
          de.red_flag,
          de.complaint.split(' ').slice(0, 3),
          `Patient presents with ${de.complaint}.`,
        ]
      );

      const queueNum = `NC-${de.dept}-${de.urgency.slice(0, 4).toUpperCase()}-${String(i + 1).padStart(3, '0')}`;
      const waitByTier = { critical: 0, high: 30, medium: 90, low: 180 };

      await client.query(
        `INSERT INTO queue_entries
           (call_id, clinic_id, department_id, patient_id, queue_number, urgency_tier,
            position_in_queue, status, estimated_wait_time)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'waiting',$8)
         ON CONFLICT (queue_number) DO NOTHING`,
        [
          call.id, clinic.id, deptIds[de.dept], patient.id,
          queueNum, de.urgency, i + 1, waitByTier[de.urgency],
        ]
      );
      console.log(`  Queue: ${queueNum} — ${patient.name} (${de.urgency})`);
    }

    // ── Hospitals ────────────────────────────────────────────────────────────
    console.log('\nInserting Kenya hospitals...');
    const hospitals = [
      { name: 'Kenyatta National Hospital',                            district: 'Nairobi',     province: 'Nairobi',     lat: -1.3013, lng: 36.8073, phone: '+254202725700', emergency: true,  specialties: ['emergency','surgery','cardiology','internal medicine','pediatrics','oncology','neurology'] },
      { name: 'The Nairobi Hospital',                                  district: 'Nairobi',     province: 'Nairobi',     lat: -1.2921, lng: 36.8006, phone: '+254202846500', emergency: true,  specialties: ['emergency','surgery','cardiology','internal medicine','oncology','orthopedics'] },
      { name: 'Aga Khan University Hospital',                          district: 'Nairobi',     province: 'Nairobi',     lat: -1.2635, lng: 36.8177, phone: '+254203660000', emergency: true,  specialties: ['cardiology','oncology','neurology','internal medicine','pediatrics'] },
      { name: 'Mama Lucy Kibaki Hospital',                             district: 'Embakasi',    province: 'Nairobi',     lat: -1.3226, lng: 36.8894, phone: '+254202647000', emergency: true,  specialties: ['emergency','obstetrics','pediatrics','internal medicine'] },
      { name: 'Mbagathi County Hospital',                              district: 'Dagoretti',   province: 'Nairobi',     lat: -1.3186, lng: 36.7698, phone: '+254202637001', emergency: true,  specialties: ['emergency','obstetrics','pediatrics','internal medicine'] },
      { name: 'Kenyatta University Teaching, Referral & Research Hospital', district: 'Kiambu',  province: 'Kiambu',      lat: -1.1814, lng: 36.9256, phone: '+254202035000', emergency: true,  specialties: ['emergency','surgery','oncology','cardiology','pediatrics'] },
      { name: 'Moi Teaching and Referral Hospital',                    district: 'Uasin Gishu', province: 'Uasin Gishu', lat: 0.5136,  lng: 35.2822, phone: '+254532033471', emergency: true,  specialties: ['emergency','surgery','cardiology','internal medicine','pediatrics','neurology'] },
      { name: 'Coast General Teaching & Referral Hospital',            district: 'Mombasa',     province: 'Mombasa',     lat: -4.0547, lng: 39.6668, phone: '+254412223934', emergency: true,  specialties: ['emergency','surgery','obstetrics','internal medicine','pediatrics'] },
      { name: 'Jaramogi Oginga Odinga Teaching & Referral Hospital',   district: 'Kisumu',      province: 'Kisumu',      lat: -0.0917, lng: 34.7680, phone: '+254572021020', emergency: true,  specialties: ['emergency','surgery','internal medicine','pediatrics','obstetrics'] },
      { name: 'Nakuru Level 5 Hospital',                               district: 'Nakuru',      province: 'Nakuru',      lat: -0.3031, lng: 36.0800, phone: '+254512213051', emergency: true,  specialties: ['emergency','surgery','obstetrics','pediatrics','internal medicine'] },
      { name: 'Machakos Level 5 Hospital',                             district: 'Machakos',    province: 'Machakos',    lat: -1.5177, lng: 37.2634, phone: '+254444202049', emergency: true,  specialties: ['emergency','surgery','internal medicine','obstetrics'] },
      { name: 'Embu Level 5 Hospital',                                 district: 'Embu',        province: 'Embu',        lat: -0.5310, lng: 37.4500, phone: '+25468223010',  emergency: true,  specialties: ['emergency','surgery','internal medicine','obstetrics'] },
      { name: 'Garissa County Referral Hospital',                      district: 'Garissa',     province: 'Garissa',     lat: -0.4536, lng: 39.6461, phone: '+25446210150',  emergency: true,  specialties: ['emergency','surgery','internal medicine'] },
      { name: 'Kericho County Referral Hospital',                      district: 'Kericho',     province: 'Kericho',     lat: -0.3689, lng: 35.2831, phone: '+254522012325', emergency: false, specialties: ['internal medicine','surgery','obstetrics','pediatrics'] },
      { name: 'Nyeri County Referral Hospital',                        district: 'Nyeri',       province: 'Nyeri',       lat: -0.4169, lng: 36.9517, phone: '+254611430001', emergency: true,  specialties: ['emergency','surgery','internal medicine','obstetrics'] },
      { name: 'Kisii Teaching & Referral Hospital',                    district: 'Kisii',       province: 'Kisii',       lat: -0.6817, lng: 34.7680, phone: '+254582030100', emergency: false, specialties: ['internal medicine','surgery','obstetrics','pediatrics'] },
    ];

    for (const h of hospitals) {
      await client.query(
        `INSERT INTO hospitals (name, district, province, phone_number, latitude, longitude, specialties, is_emergency)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT DO NOTHING`,
        [h.name, h.district, h.province, h.phone, h.lat, h.lng, h.specialties, h.emergency]
      );
      console.log(`  Hospital: ${h.name} (${h.district})`);
    }

    await client.query('COMMIT');
    console.log('\nSeed complete.');
    console.log('\nDemo credentials:');
    console.log('  admin@nairobi.clinic  / password123');
    console.log('  staff@nairobi.clinic  / password123');
    console.log('  doctor@nairobi.clinic / password123');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
