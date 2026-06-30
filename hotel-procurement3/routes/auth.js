const express = require('express');
const router  = express.Router();

function getUsers() {
  const map = {};
  (process.env.USERS || 'admin:admin123').split(',').forEach(entry => {
    const [u, ...rest] = entry.trim().split(':');
    if (u) map[u.toLowerCase()] = rest.join(':');
  });
  return map;
}

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: 'Username and password required' });
  const users = getUsers();
  if (users[username.toLowerCase()] !== password)
    return res.status(401).json({ error: 'Invalid username or password' });
  req.session.user = {
    id:   username.toLowerCase(),
    name: username.charAt(0).toUpperCase() + username.slice(1)
  };
  res.json({ success: true, user: req.session.user });
});

router.get('/me', (req, res) => {
  if (req.session?.user) return res.json({ user: req.session.user });
  res.status(401).json({ user: null });
});

router.post('/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

module.exports = router;
