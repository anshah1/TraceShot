import { createClient } from '@supabase/supabase-js'
import { ApiError } from './errors'

const supabaseUrl = process.env.SUPABASE_PROJECT_URL
const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase credentials')
}

export const supabase = createClient(supabaseUrl, supabaseKey)

export async function createScreenshot(screenshotKeyIn: string, urlIn: string) {
  const { data : preexisting } = await supabase
  .from('screenshots')
  .select('*')
  .eq('screenshot_key', screenshotKeyIn)
  .single()

  if (preexisting) throw new ApiError(409, 'KEY_COLLISION', 'Screenshot key already exists')

  const { data, error } = await supabase
  .from('screenshots')
  .insert({
    screenshot_key: screenshotKeyIn,
    url: urlIn
  })
  .select();

  if (error) {
    console.log('Insert error:', error)  // ← Log this
    throw new ApiError(500, 'DB_ERROR', error.message)
  }  
  return data;
}

export async function getURL(screenshotKeyIn: string) {
  const { data : entry} = await supabase
  .from('screenshots')
  .select('*')
  .eq('screenshot_key', screenshotKeyIn)
  .single();

  if (!entry) throw new ApiError(404, 'NOT_FOUND', 'No screenshot with given key exists')
  return entry.url;
}

export async function containsUserWithId(idIn: string) {
  const { data : user} = await supabase
  .from('users')
  .select('*')
  .eq('user_id', idIn)
  .single();

  if (user) return true;
  return false;
}

export async function getUserByEmail(emailIn: string) {
  const { data : user} = await supabase
  .from('users')
  .select('*')
  .eq('email', emailIn)
  .single();

  return user || null;
}

export async function createUser(emailIn: string, userIdIn: string) {
  const { data, error } = await supabase
  .from('users')
  .insert({
    email: emailIn,
    user_id: userIdIn,
  })
  .select();

  if (error) throw new ApiError(500, 'DB_ERROR', error.message)
  return data[0];
}