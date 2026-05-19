import { sql } from '@vercel/postgres';

export const db = {
  get: async (table, query = "") => {
      try {
            let sqlQuery = `SELECT * FROM ${table}`;
                  const emailMatch = query.match(/email=eq\.(.+?)(?=&|$)/);
                        if (emailMatch) {
                                sqlQuery = `SELECT * FROM ${table} WHERE email = '${emailMatch[1]}'`;
                                      }
                                            const result = await sql.query(sqlQuery);
                                                  return result.rows;
                                                      } catch (error) {
                                                            console.error(`Error fetching from ${table}:`, error);
                                                                  return [];
                                                                      }
                                                                        },
                                                                          
                                                                            post: async (table, data) => {
                                                                                const columns = Object.keys(data).join(', ');
                                                                                    const values = Object.values(data);
                                                                                        const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
                                                                                            const query = `INSERT INTO ${table} (${columns}) VALUES (${placeholders}) RETURNING *`;
                                                                                                const result = await sql.query(query, values);
                                                                                                    return result.rows[0];
                                                                                                      },
                                                                                                        
                                                                                                          patch: async (table, id, data) => {
                                                                                                              const updates = Object.entries(data).map(([key, value], i) => `${key} = $${i + 1}`).join(', ');
                                                                                                                  const values = [...Object.values(data), id];
                                                                                                                      const query = `UPDATE ${table} SET ${updates} WHERE id = $${values.length} RETURNING *`;
                                                                                                                          const result = await sql.query(query, values);
                                                                                                                              return result.rows[0];
                                                                                                                                },
                                                                                                                                  
                                                                                                                                    delete: async (table, id) => {
                                                                                                                                        await sql.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
                                                                                                                                          }
                                                                                                                                          };