import { Schema } from 'effect';

/** What a photo shows, as a model described it. */
export const Description = Schema.Struct({ description: Schema.String });

/** How a model is asked to describe a photo, for the edit and the caption. */
export const whatToDescribe =
  'what it shows in one or two sentences: the subject and what it does, where it is, the light, the weather, and the time of day. Name a species or a place only when you are sure of it, and give no opinion in the description.';
