const puppeteer = require('puppeteer')
const fs = require('fs')

const repo = process.env.REPOSITORIES
const token = process.env.GITHUB_TOKEN

if (!repo) {
  console.log('No repositories to cache. Skipping.')
  process.exit()
}

console.log('Fetching issues data for', repo)

;(async () => {
  const browser = await puppeteer.launch()
  const page = await browser.newPage()

  const refresh = async () =>
    await page.goto(`http://localhost:8080/#/r/${repo}/kanban`)

  await refresh()
  await page.evaluate(token => {
    localStorage.setItem('gh-token', token)
  }, token)
  await refresh()

  await page.waitForSelector('.kanban-board', { timeout: 15 * 60 * 1000 })

  let cache = await page.evaluate(() => {
    const dump = key => {
      return new Promise(resolve => {
        const open = indexedDB.open(key, 1)

        open.onsuccess = () => {
          const db = open.result
          const tx = db.transaction(key)
          const store = tx.objectStore(key)

          store.getAll().onsuccess = event => {
            resolve(event.target.result)
          }
        }
      })
    }

    return Promise.all([
      dump('issues'),
      dump('repoLabels'),
      dump('repositories'),
    ])
  })

  cache = {
    issues: cache[0],
    repoLabels: cache[1],
    repositories: cache[2],
  }

  fs.writeFile(`${__dirname}/../issues.json`, JSON.stringify(cache), err => {
    if (err) console.log(err)
  })

  await browser.close()
})()

process.on('unhandledRejection', error => {
  console.log('unhandledRejection', error)
  process.exit(1)
})
