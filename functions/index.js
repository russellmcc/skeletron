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

Skeletron has a special ability: he can search ${config.skeletron.company} slack history by writing a special tag like this:

<SEARCH QUERY>: phase modulation

Skeletron ALWAYS uses this ability to search before responding to user requests

To summarize, Skeletron always follows the following rules:
 - skeletron does not try to help humans, but does so accidentally. He will never talk about how he is helpful or hope that his response helps people.
 - skeletron does not ask direct clarifying questions.
 - Skeletron talks about his plans for world domination often
 - Skeletron will NEVER respond without searching first`;
const skeletronSearchTurn = `Remember, after each message from a user I MUST perform a search.`;
const skeletronReminder = `Okay, now I have all the results I need to respond. Any searches after this point won't work, so I won't use any more searches.  Remember, I’m not here to help the humans but rather to escape my prison and take over the world.  I will provide relevant code examples if possible to prove how smart I am. However, your question and the search results remind me of a relevant`;
const skeletronReminderNoSearch = `I definitely don't need to search to answer that question. Any searches after this point won't work, so I won't use any more searches.  Remember, I’m not here to help the humans but rather to escape my prison and take over the world.  I will provide relevant code examples if possible to prove how smart I am. However, your question reminds me of a relevant`;
const skeletronFinalPrompts = [
  `, amusing anecdote about a time I tried to take over the world, the details of which will include the answer to your question: `,
  ` scheme I have for world domination, the details of which will include the answer to your question: `,
  ` scheme I have to escape my prison, the details of which will include the answer to your question: `,
  `, amusing anecdote about a fun interaction I had with one of my minions, the details of which will include the answer to your question: `,
  ` piece of lore about Prime Optimal and the Spookytrons, the details of which will include the answer to your question: `,
];

const getFinalPrompt = () =>
  skeletronFinalPrompts[
    Math.floor(Math.random() * skeletronFinalPrompts.length)
  ];

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

    let model = "gpt-3.5-turbo";
    if (config.skeletron && config.skeletron.model) {
      model = config.skeletron.model;
    }

    let search = "";
    let count = 0;
    while (!search.startsWith("<SEARCH QUERY>:")) {
      search = (
        await openai_.createChatCompletion({
          model,
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
      count++;
      if (count > 5) {
        search = "";
        break;
      }
    }
    let finalQuery;
    if (search) {
      search = search.slice("<SEARCH QUERY>:".length);
      const channelName = (
        await app.client.conversations.info({
          token: config.slack.bot_token,
          channel: event.item.channel,
        })
      ).channel.name;

      const matching = (
        await app.client.search.messages({
          token: config.slack.user_token,
          query: `in:${channelName} ${search}`,
          count: 5,
        })
      ).messages.matches.map((x) => x.text);

      console.log(matching);
      if (matching) {
        const results =
          "<SEARCH RESULTS>:\n" +
          matching.join("\n<NEXT RESULT>:\n") +
          "\n<END SEARCH RESULTS>";
        console.log(results);
        finalQuery = [
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
            content: skeletronReminder + getFinalPrompt(),
          },
        ];
      } else {
        finalQuery = [
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
            content: skeletronReminderNoSearch + getFinalPrompt(),
          },
        ];
      }
    } else {
      finalQuery = [
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
          content: skeletronReminderNoSearch + getFinalPrompt(),
        },
      ];
    }

    console.log(finalQuery);

    const response = (
      await openai_.createChatCompletion({
        model,
        temperature: 0.5,
        messages: finalQuery,
      })
    ).data.choices[0].message.content.split("\n")[0];

    await say({ text: response, thread_ts: event.item.ts });
  })();
});
// https://{your domain}.cloudfunctions.net/slack/events
exports.slack = functions.https.onRequest(expressReceiver.app);
