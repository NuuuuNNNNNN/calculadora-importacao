export default (req, res) => {
  res.status(200).json({ 
    message: 'API works',
    url: req.body?.url || 'no url'
  });
};
