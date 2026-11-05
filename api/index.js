const vercelHandler = require('../server/src/vercel-handler');

module.exports = function apiHandler(req, res) {
  // Vercel rewrites all /api/* URLs to this shared function. Restore the
  // original Express path from the rewrite parameter before passing it on.
  const incoming = new URL(req.url, 'http://vercel.local');
  const apiPath = incoming.searchParams.get('__api_path');
  if (apiPath !== null) {
    incoming.searchParams.delete('__api_path');
    const path = apiPath ? `/api/${apiPath.replace(/^\/+/, '')}` : '/api';
    const query = incoming.searchParams.toString();
    req.url = query ? `${path}?${query}` : path;
  }

  return vercelHandler(req, res);
};
