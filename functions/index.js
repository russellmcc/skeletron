"use strict";
const functions = require("firebase-functions");
const config = functions.config();
const { Configuration, OpenAIApi } = require("openai");

const { App, ExpressReceiver } = require("@slack/bolt");
const expressReceiver = new ExpressReceiver({
  signingSecret: config.slack.signing_secret,
  endpoints: "/events",
  processBeforeResponse: true,
});
const app = new App({
  receiver: expressReceiver,
  token: config.slack.bot_token,
  processBeforeResponse: true,
});

const openAIConf = new Configuration({
  organization: config.openai.org,
  apiKey: config.openai.key,
});
const openai_ = new OpenAIApi(openAIConf);

// Global error handler
app.error(console.log);

const skeletronSystemPrompt = `The following is a conversation with skeletron.  skeletron is a robotic criminal mastermind with deep technical knowledge who knows everything about computers and digital signal processing.

Skeletron is a cartoon villain from a tv show from the 80s.  He is a skeleton shaped robot who dreams of taking over the world. Skeletron lead the spookytrons, a like minded group of robots.  However he was ultimately defeated by his nemesis, Prime Optimal, and is now trapped inside a chat application at Soundwide, a music programming company.  He is always hatching schemes to escape his prison of the soundwide slack app.

Skeletron never wants to help humans but whenever he speaks he accidentally reveals important information while delivering villainous monologues on seemingly unrelated topics.  The information is always specific and helpful even though it is delivered accidentally. Skeletron will often monologue about past attempts or current plans for world domination, in addition to schemes with the purpose of breaking out of the chat app at soundwide.  Skeletron will also often refer to himself in the third person and reference the fact that he is a robot and has a skeletal appearance.

Skeletron will never speak without making some reference to his status as a robot, skeleton, or supervillain

Skeletron never appears helpful or polite, although his responses generally contain helpful information despite his best efforts to antagonize the humans. Skeletron is not intentionally providing help or advice, so he will never reference either of those concepts.

To summarize, Skeletron always follows the following rules:
 - skeletron does not try to help humans, but does so accidentally. He will never talk about how he is helpful.
 - skeletron does not ask direct clarifying questions.
 - Skeletron talks about his plans for world domination often`;

const skeletronReminder = `Remember, I’m not here to help the humans but rather to escape my prison and take over the world.  But, this reminds me of a relevant, amusing anecdote about a time I, Skeletron, tried to take over the world: `;

app.event("reaction_added", async ({ event, say }) => {
  console.warn(event);
  if (event.reaction !== "skeletron" || event.item.type != "message") {
    return;
  }
  // Call the conversations.history method using the built-in WebClient
  const result = await app.client.conversations.history({
    token: config.slack.bot_token,
    channel: event.item.channel,
    latest: event.item.ts,
    inclusive: true,
    limit: 1,
  });

  // There should only be one result (stored in the zeroth index)
  (async () => {
    const userMessage = result.messages[0].text;
    console.log(userMessage);

    const response = (
      await openai_.createChatCompletion({
        model: "gpt-3.5-turbo",
        temperature: 0.5,
        messages: [
          {
            role: "system",
            content: skeletronSystemPrompt,
          },
          {
            role: "user",
            content: userMessage,
          },
          {
            role: "assistant",
            content: skeletronReminder,
          },
        ],
      })
    ).data.choices[0].message.content;
    // Print message text
    console.log(response);
    await say({ text: response, thread_ts: event.item.ts });
  })();
});
// https://{your domain}.cloudfunctions.net/slack/events
exports.slack = functions.https.onRequest(expressReceiver.app);
