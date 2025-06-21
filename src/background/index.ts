console.log('background is running')

chrome.runtime.onMessage.addListener((request) => {
  console.log(`request`, request)
})

// Allows users to open the side panel by clicking on the action toolbar icon
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

