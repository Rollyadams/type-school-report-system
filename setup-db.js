const { sql } = require('@vercel/postgres');

async function setupDatabase() {
  console.log('Setting up database...');
    
      try {
          // Create users table
              await sql`
                    CREATE TABLE IF NOT EXISTS users (
                            id SERIAL PRIMARY KEY,
                                    email TEXT UNIQUE,
                                            full_name TEXT,
                                                    role TEXT
                                                          );
                                                              `;
                                                                  console.log('Users table ready');

                                                                      // Insert test user
                                                                          await sql`
                                                                                INSERT INTO users (email, full_name, role) 
                                                                                      VALUES ('principal@school.com', 'Principal Admin', 'principal')
                                                                                            ON CONFLICT (email) DO NOTHING;
                                                                                                `;
                                                                                                    console.log('Test user added');
                                                                                                        
                                                                                                            console.log('Database setup complete!');
                                                                                                                console.log('Login with: principal@school.com / school1234');
                                                                                                                    
                                                                                                                      } catch (error) {
                                                                                                                          console.error('Setup failed:', error);
                                                                                                                            }
                                                                                                                            }

                                                                                                                            setupDatabase();