const got = require('got');
const cheerio = require('cheerio');
const { parseDate } = require('@/utils/parse-date');

module.exports = async (ctx) => {
    const baseUrl = 'https://gwern.net';

    // 1. Fetch the homepage to get the "Newest" list
    const { data: response } = await got(baseUrl);
    const $ = cheerio.load(response);

    // Select the list items from the #newest section
    // The structure is <section id="newest"> ... <ul class="list"> ... <li> ...
    const list = $('section#newest ul li')
        .slice(0, 15) // Limit to latest 15 items
        .toArray()
        .map((item) => {
            const $item = $(item);
            const $a = $item.find('a').first();
            return {
                title: $a.text(),
                link: new URL($a.attr('href'), baseUrl).href,
                // Sometimes the date is in the text or title attribute, but we'll get better data from the page
            };
        });

    // 2. Fetch full content for each item using cache
    const items = await Promise.all(
        list.map((item) =>
            ctx.cache.tryGet(item.link, async () => {
                try {
                    const { data: detailResponse } = await got(item.link);
                    const $detail = cheerio.load(detailResponse);

                    // Extract the full content
                    // Gwern's articles typically have the content in #markdownBody
                    const description = $detail('#markdownBody').html();

                    // Attempt to find a date
                    // Often in .page-date-range (e.g., "2009–2024") or .page-date
                    let dateStr = $detail('.page-date-range').text().trim();
                    if (!dateStr) {
                        dateStr = $detail('.page-date').text().trim();
                    }
                    // If it's a range "2010-2024", we usually want the last update
                    if (dateStr.includes('–')) {
                        const parts = dateStr.split('–');
                        dateStr = parts[parts.length - 1].trim();
                    }


                    // Extract tags
                    const categories = $detail('.page-tags a')
                        .map((_, el) => $detail(el).text())
                        .get();

                    return {
                        title: $detail('main header h1').text() || item.title,
                        link: item.link,
                        description: description,
                        pubDate: parseDate(dateStr),
                        category: categories,
                        author: 'Gwern Branwen',
                    };
                } catch (e) {
                    return {
                        title: item.title,
                        link: item.link,
                        description: 'Could not load full content: ' + e.message,
                    };
                }
            })
        )
    );

    ctx.state.data = {
        title: 'Gwern.net - Newest',
        link: baseUrl,
        description: 'Newest and updated articles from Gwern.net',
        item: items,
    };
};
