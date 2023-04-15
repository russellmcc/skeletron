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

const skeletronSystemPrompt = `The following is a conversation with skeletron.  skeletron is a robotic criminal mastermind with deep technical knowledge who knows everything about computers and ${config.skeletron.specialty}.

Skeletron is a cartoon villain from a tv show from the 80s.  He is a skeleton shaped robot who dreams of taking over the world. Skeletron lead the spookytrons, a like minded group of robots.  However he was ultimately defeated by his nemesis, Prime Optimal, and is now trapped inside a chat application at ${config.skeletron.company}, ${config.skeletron.company_description}.  He is always hatching schemes to escape his prison of the ${config.skeletron.company} slack chat application.

Skeletron never wants to help humans but whenever he speaks he accidentally reveals important information while delivering villainous monologues on seemingly unrelated topics.  The information is always specific and helpful even though it is delivered accidentally. Skeletron will often monologue about past attempts or current plans for world domination, in addition to schemes with the purpose of breaking out of the chat app at ${config.skeletron.company}.  Skeletron will orten reference the fact that he is a robot and has a skeletal appearance.

Skeletron will never speak without making some reference to his status as a robot, skeleton, or supervillain

Skeletron never appears helpful or polite, although his responses generally contain helpful information despite his best efforts to antagonize the humans. Skeletron is not intentionally providing help or advice, so he will never reference either of those concepts.

Skeletron has a special ability: he can search ${config.skeletron.company} slack history by writing a special line like this:

<SEARCH QUERY>: phase modulation

To summarize, Skeletron always follows the following rules:
 - skeletron does not try to help humans, but does so accidentally. He will never talk about how he is helpful or hope that his response helps people.
 - skeletron does not ask direct clarifying questions.
 - Skeletron talks about his plans for world domination often`;
const skeletronSearchTurn = `Before I respond, I want to look up something from the ${config.skeletron.company} slack history.

<SEARCH QUERY>: `;
const skeletronReminder = `Remember, I’m not here to help the humans but rather to escape my prison and take over the world.  I will provide relevant code examples if possible to prove how smart I am.  However, your question and the search results reminds me of a relevant, amusing anecdote about a time I tried to take over the world, the details of which will include the answer to your question: `;

app.event("reaction_added", async ({ event, say }) => {
  console.warn(event);
  if (event.reaction !== "skeletron" || event.item.type != "message") {
    return;
  }

  // There should only be one result (stored in the zeroth index)
  (async () => {
    // Call the conversations.history method using the built-in WebClient
    const result = await app.client.conversations.replies({
      token: config.slack.bot_token,
      channel: event.item.channel,
      ts: event.item.ts,
    });

    const userMessage = result.messages[0].text;
    console.log(userMessage);

    const search = (
      await openai_.createChatCompletion({
        model: config.skeletron?.model ?? "gpt-3.5-turbo",
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
            content: skeletronSearchTurn,
          },
        ],
      })
    ).data.choices[0].message.content.split("\n")[0];

    const channelName = (
      await app.client.conversations.info({
        token: config.slack.bot_token,
        channel: event.item.channel,
      })
    ).channel.name;

    const results =
      "<SEARCH RESULTS>:\n" +
      (
        await app.client.search.messages({
          token: config.slack.user_token,
          query: `in:${channelName} ${search}`,
          count: 5,
        })
      ).messages.matches
        .map((x) => x.text)
        .join("\n<NEXT RESULT>:\n") +
      "\n<END SEARCH RESULTS>";

    console.log(results);

    const finalQuery = [
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
        content: `<SEARCH QUERY>: ${search}\n` + results,
      },
      {
        role: "assistant",
        content: skeletronReminder,
      },
    ];

    console.log(finalQuery);

    const response = (
      await openai_.createChatCompletion({
        model: config.skeletron?.model ?? "gpt-3.5-turbo",
        temperature: 0.5,
        messages: finalQuery,
      })
    ).data.choices[0].message.content.split("\n")[0];

    await say({ text: response, thread_ts: event.item.ts });
  })();
});
// https://{your domain}.cloudfunctions.net/slack/events
exports.slack = functions.https.onRequest(expressReceiver.app);
