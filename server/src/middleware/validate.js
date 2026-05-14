function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.flatten().fieldErrors;
      return res.status(400).json({ message: 'Validation failed', errors });
    }
    req.body = result.data;
    next();
  };
}

module.exports = { validate };
