function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const flat   = result.error.flatten();
      const errors = flat.fieldErrors;
      // Lead with the specific complaint. Clients surface `message`, and
      // "Validation failed" tells the person filling the form nothing about
      // which field to fix.
      const first =
        Object.values(errors).find((msgs) => msgs?.length)?.[0] ??
        flat.formErrors?.[0];
      return res.status(400).json({ message: first || 'Validation failed', errors });
    }
    req.body = result.data;
    next();
  };
}

module.exports = { validate };
