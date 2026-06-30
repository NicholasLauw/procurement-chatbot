function requireAuth(req, res, next) {
  if (req.session?.user) return next();
  return res.status(401).json({ error: 'Unauthorized. Please log in.' });
}
module.exports = { requireAuth };
