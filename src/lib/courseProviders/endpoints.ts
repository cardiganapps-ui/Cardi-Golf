/**
 * Where the two course providers answer (§13b-A), for api/course-search.ts and scripts/seed-courses.mjs (STRAT-14):
 * the same requests from both. Plain values only, so the script runs this file in Node as it is.
 */
export const GOLFCOURSE_API = 'https://api.golfcourseapi.com/v1'
export const OPENGOLF_API = 'https://api.opengolfapi.org'

export const golfCourseSearchUrl = (q: string) => `${GOLFCOURSE_API}/search?search_query=${encodeURIComponent(q)}`
export const golfCourseUrl = (id: string) => `${GOLFCOURSE_API}/courses/${encodeURIComponent(id)}`
export const golfCourseHeaders = (key: string): Record<string, string> => ({ Authorization: `Key ${key}` })

export const openGolfSearchUrl = (q: string) => `${OPENGOLF_API}/v1/courses/search?q=${encodeURIComponent(q)}`
export const openGolfCourseUrl = (id: string) => `${OPENGOLF_API}/api/v1/courses/${encodeURIComponent(id)}`
/** Reads work without a key; the key raises the limits. */
export const openGolfHeaders = (key: string | undefined): Record<string, string> => (key ? { Authorization: `Bearer ${key}` } : {})
