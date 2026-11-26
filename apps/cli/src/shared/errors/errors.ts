import { Schema } from 'effect';

// The command's own arguments are wrong, before anything is read or sent.
export class InvalidInput extends Schema.TaggedError<InvalidInput>()(
  'InvalidInput',
  { message: Schema.String },
) {}

// No API key for the provider is stored on this machine, or the provider no
// longer accepts it.
export class NotSignedIn extends Schema.TaggedError<NotSignedIn>()(
  'NotSignedIn',
  { message: Schema.String },
) {}

// A model refused a request or answered with something unusable, even after
// the retries.
export class ModelFailed extends Schema.TaggedError<ModelFailed>()(
  'ModelFailed',
  { message: Schema.String },
) {}

// A model is busy or out of reach, which a later try may not meet.
export class TryLater extends Schema.TaggedError<TryLater>()('TryLater', {
  message: Schema.String,
}) {}

// An image model's safety check refused to edit a photo.
export class PhotoRefused extends Schema.TaggedError<PhotoRefused>()(
  'PhotoRefused',
  { message: Schema.String },
) {}

// A program keepsake runs, such as exiftool or ImageMagick, is missing or
// failed.
export class ToolFailed extends Schema.TaggedError<ToolFailed>()('ToolFailed', {
  message: Schema.String,
}) {}

// A file of keepsake's own cannot be read or written.
export class StoreFailed extends Schema.TaggedError<StoreFailed>()(
  'StoreFailed',
  { message: Schema.String },
) {}

// A step needs the result of an earlier one that has not run yet.
export class StepMissing extends Schema.TaggedError<StepMissing>()(
  'StepMissing',
  { message: Schema.String },
) {}

// Another keepsake command is already working on the shoot.
export class ShootBusy extends Schema.TaggedError<ShootBusy>()('ShootBusy', {
  message: Schema.String,
}) {}

// A paid request could cost more than is left of the budget, or costs what
// keepsake doesn't know, so it isn't sent.
export class OverBudget extends Schema.TaggedError<OverBudget>()('OverBudget', {
  message: Schema.String,
}) {}
