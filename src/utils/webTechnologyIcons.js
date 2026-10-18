// Vendored SVGs only. Sources, licenses and brand/family/fallback distinctions:
// public/assets/web-technologies/manifest.json and NOTICE.md.
const brandedIds = new Set([
  'alpinejs', 'angular', 'antd', 'apache', 'aspnet', 'astro', 'bootstrap', 'caddy',
  'chartjs', 'docusaurus', 'drupal', 'echarts', 'element-plus', 'express', 'gatsby',
  'ghost', 'git', 'gitlab', 'grafana', 'gunicorn', 'htmx', 'jenkins', 'jetty',
  'joomla', 'jquery', 'laravel', 'minio', 'nextjs', 'nginx', 'nuxt', 'php',
  'phpmyadmin', 'react', 'sveltekit', 'swagger-ui', 'vitepress', 'vue', 'vuetify',
  'wordpress',
])

export function webTechnologyIcon(id) {
  const key = typeof id === 'string' ? id.toLowerCase() : ''
  const file = brandedIds.has(key) || key === 's3' ? key : 'generic'
  return `${import.meta.env?.BASE_URL || '/'}assets/web-technologies/${file}.svg`
}
