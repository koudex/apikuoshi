// Debug what req.query looks like for the user's case 2
import express from "express";
const app = express();
app.get("/test", (req, res) => {
  res.json({
    genre: req.query.genre,
    genreType: typeof req.query.genre,
    isArray: Array.isArray(req.query.genre),
    rawUrl: req.url,
  });
});
app.listen(7777, () => console.log("debug server on 7777"));
