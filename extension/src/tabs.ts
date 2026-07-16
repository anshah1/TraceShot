import type { Tab } from './types'

// Returns tab data; access via: tab.url, tab.title, tab.origin
export async function getCurrentTab(): Promise<Tab | null> {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
    const tab = tabs[0]

    if (!tab?.url || !tab?.title) {
      return null
    }

    const url = new URL(tab.url)
    return {
      url: tab.url,
      title: tab.title,
      origin: url.origin,
    }
  } catch (error) {
    console.error('Failed to get current tab:', error)
    return null
  }
}
