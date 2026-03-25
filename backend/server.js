const express = require('express');
const app = express();
const PORT = 3000;
const projects = require('../execution/projects');

app.get('/', (req, res) => {
  res.send('RepoPulse backend is running');
});

app.get('/projects', (req, res) => {
  res.json(projects);
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

module.exports = app;
