import { createClient } from '@supabase/supabase-js'
import { ApiError } from './errors'

const supabaseUrl = process.env.SUPABASE_PROJECT_URL
const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase credentials')
}

export const supabase = createClient(supabaseUrl, supabaseKey)

async function createScreenshot(screenshotKeyIn: string, urlIn: string) {
  const { data : preexisting } = await supabase
  .from('screenshots')
  .select('*')
  .eq('screenshot_key', screenshotKeyIn);

  if (preexisting) throw new ApiError(409, 'KEY_COLLISION', 'Screenshot key already exists')

  const { data, error } = await supabase
  .from('screenshots')
  .insert({
    screenshot_key: screenshotKeyIn,
    url: urlIn
  })
  .select();

  if (error) throw new ApiError(500, 'DB_ERROR', 'Failed to create snapshot')
  return data;
}

async function getURL(screenshotKeyIn: string) {
  const { data : entry} = await supabase
  .from('screenshots')
  .select('*')
  .eq('screenshot_key', screenshotKeyIn)
  .single();

  if (!entry) throw new ApiError(404, 'NOT_FOUND', 'No screenshot with given key exists')
  return entry.url;
}

async function getUserId(emailIn: string) {
  const { data : user} = await supabase
  .from('users')
  .select('*')
  .eq('email', emailIn)
  .single();

  if (!user) throw new ApiError(404, 'NOT_FOUND', 'No user with the given email exists')
  return user.email;
}