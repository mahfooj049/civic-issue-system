const jwt = require("jsonwebtoken");
const User = require("../models/User");

// Verifies JWT token from cookie, attaches user to req and res.locals
const isLoggedIn = async (req, res, next) => {
  const token = req.cookies.token;

  if (!token) {
    req.flash("error", "Please login first");
    return res.redirect("/login");
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      req.flash("error", "User not found, please login again");
      return res.redirect("/login");
    }

    req.user = user;
    res.locals.currUser = user;
    next();
  } catch (err) {
    req.flash("error", "Session expired, please login again");
    return res.redirect("/login");
  }
};

// Optional auth - attaches user if logged in, but doesn't block if not
const attachUserIfLoggedIn = async (req, res, next) => {
  const token = req.cookies.token;
  res.locals.currUser = null;

  if (token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select("-password");
      if (user) {
        req.user = user;
        res.locals.currUser = user;
      }
    } catch (err) {
      // invalid token, ignore silently
    }
  }
  next();
};

module.exports = { isLoggedIn, attachUserIfLoggedIn };
