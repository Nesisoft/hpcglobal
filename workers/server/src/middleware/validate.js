const { z } = require('zod');

/**
 * Check a request body against a zod schema. A refusal leads with the first
 * problem in `message`, names its input in `field`, and lists every field's
 * first problem in `errors`, so a form can mark each box at once.
 */
function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      const flat   = z.flattenError(result.error);
      const errors = Object.fromEntries(
        Object.entries(flat.fieldErrors).filter(([, msgs]) => msgs?.length).map(([field, msgs]) => [field, msgs[0]]),
      );
      const [field, message] = Object.entries(errors)[0] ?? [undefined, flat.formErrors?.[0]];
      return res.status(400).json({ message: message || 'Please check the form and try again.', field, errors });
    }
    req.body = result.data;
    next();
  };
}

module.exports = { validate };
