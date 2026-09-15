import type { JsonSchema } from "../json-schema";

export const HN_SCHEMA: JsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["stories"],
  properties: {
    stories: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["rank", "title", "points", "comments", "url"],
        properties: {
          rank: { type: "integer" },
          title: { type: "string" },
          points: { type: "integer" },
          comments: { type: "integer" },
          url: { type: "string" },
        },
      },
    },
  },
};

export const HN_MARKDOWN = `Hacker News

1.

[Show HN: An e-ink frame that hears birds](https://github.com/arnegiacomo/fugleramme)

422 points by arnemunthekaas 2 hours ago | 74 comments

2.

[Java 27 Released](https://mail.openjdk.org/archives/list/announce@openjdk.org/thread/example)

183 points by mkurz 2 hours ago | 132 comments

3.

[Show HN: Capsule – Single-file web apps](https://withcapsule.app/)

79 points by bashtian 1 hour ago | discuss
`;

export const HN_VALID_PAYLOAD = {
  stories: [
    {
      rank: 1,
      title: "Show HN: An e-ink frame that hears birds",
      points: 422,
      comments: 74,
      url: "https://github.com/arnegiacomo/fugleramme",
    },
    {
      rank: 2,
      title: "Java 27 Released",
      points: 183,
      comments: 132,
      url: "https://mail.openjdk.org/archives/list/announce@openjdk.org/thread/example",
    },
    {
      rank: 3,
      title: "Show HN: Capsule – Single-file web apps",
      points: 79,
      comments: 0,
      url: "https://withcapsule.app/",
    },
  ],
};
