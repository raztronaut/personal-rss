import { load } from 'cheerio';
import type { Route } from '@/types';
import got from '@/utils/got';
import cache from '@/utils/cache';
import { parseDate } from '@/utils/parse-date';

export const route: Route = {
    path: '/newest',
    categories: ['blog'],
    example: '/gwern/newest',
    parameters: {},
    features: {
        requireConfig: false,
        requirePuppeteer: false,
        antiCrawler: false,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    radar: [
        {
            source: ['gwern.net'],
        },
    ],
    name: 'Newest Articles',
    maintainers: ['gwern-fan'],
    handler,
    description: 'Newest and updated articles from Gwern.net',
};

async function handler(ctx) {
    const baseUrl = 'https://gwern.net';
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };

    // 1. Fetch the homepage to get the "Newest" list
    const { data: response } = await got(baseUrl, { headers });
    const $ = load(response);

    // Select the list items from the #newest section
    const list = $('section#newest ul li')
        .slice(0, 15) // Limit to latest 15 items
        .toArray()
        .map((item) => {
            const $item = $(item);
            const $a = $item.find('a').first();
            return {
                title: $a.text(),
                // Use .attr instead of reading property to get relative/absolute correctly based on dom
                link: new URL($a.attr('href') || '', baseUrl).href,
            };
        });

    // 2. Fetch full content for each item using cache
    const items = await Promise.all(
        list.map((item) =>
            cache.tryGet(item.link, async () => {
                try {
                    const { data: detailResponse } = await got(item.link, { headers });
                    const $detail = load(detailResponse);

                    // Extract the full content
                    const description = $detail('#markdownBody').html();

                    // Attempt to find a date
                    let dateStr = $detail('.page-date-range').text().trim();
                    if (!dateStr) {
                        dateStr = $detail('.page-date').text().trim();
                    }
                    if (dateStr.includes('–')) {
                        const parts = dateStr.split('–');
                        dateStr = parts[parts.length - 1].trim();
                    }

                    // Extract tags
                    const categories = $detail('.page-tags a')
                        .map((_, el) => $detail(el).text())
                        .get();

                    // Fallback for debugging
                    const debugInfo = `<br><br><small>Debug: Raw Date Found: "${dateStr}"</small>`;

                    return {
                        title: $detail('main header h1').text() || item.title,
                        link: item.link,
                        description: description || '',
                        pubDate: parseDate(dateStr),
                        category: categories,
                        author: 'Gwern Branwen',
                    };
                } catch (e) {
                    return {
                        title: item.title,
                        link: item.link,
                        description: 'Could not load full content: ' + (e instanceof Error ? e.message : String(e)),
                    };
                }
            })
        )
    );

    return {
        title: 'Gwern.net - Newest',
        link: baseUrl,
        description: 'Newest and updated articles from Gwern.net',
        item: items,
    };
}
