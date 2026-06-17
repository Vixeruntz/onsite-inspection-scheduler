const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#0b1720"/>
  <path d="M20 42h20a8 8 0 0 0 0-16H24a6 6 0 0 1 0-12h20" fill="none" stroke="#ffffff" stroke-width="5" stroke-linecap="round"/>
  <circle cx="20" cy="42" r="6" fill="#0f8b8d" stroke="#ffffff" stroke-width="3"/>
  <circle cx="44" cy="14" r="6" fill="#0f8b8d" stroke="#ffffff" stroke-width="3"/>
</svg>`;

export const GET = () =>
  new Response(icon, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=31536000, immutable"
    }
  });
