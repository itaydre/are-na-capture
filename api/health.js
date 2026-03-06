// Health check endpoint for Vercel

module.exports = (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json({
    status: 'ok',
    message: 'Are.na OAuth proxy server is running'
  });
};
