import fs from 'fs';

const baseUrl = 'https://www.mceprinting.com'; // Replace with your actual domain
const pages = [
  '/',
  '/about',
  '/contact',
  '/file-setup-guides',
  '/our-equipment',
];

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  ${pages
    .map((page) => {
      return `
    <url>
      <loc>${`${baseUrl}${page}`}</loc>
      <lastmod>${new Date().toISOString()}</lastmod>
    </url>
      `;
    })
    .join('')}
</urlset>
`;

fs.writeFileSync('out/sitemap.xml', sitemap);
