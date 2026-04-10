import { http, HttpResponse } from "msw";
import {
  listFixture,
  readFixture,
  sentListFixture,
  sentReadFixture,
  threadFixture,
  directoryListFixture,
  directoryShowFixture,
  directoryMembersFixture,
  notFoundError,
} from "@inbox/contracts/fixtures";

const BASE = "/api";

export const handlers = [
  http.get(`${BASE}/inbox`, () => HttpResponse.json(listFixture)),
  http.get(`${BASE}/inbox/:messageId`, ({ params }) => {
    if (params.messageId === readFixture.message.message_id) {
      return HttpResponse.json(readFixture);
    }
    return HttpResponse.json(notFoundError, { status: 404 });
  }),
  http.get(`${BASE}/sent`, () => HttpResponse.json(sentListFixture)),
  http.get(`${BASE}/sent/:messageId`, ({ params }) => {
    if (params.messageId === sentReadFixture.message.message_id) {
      return HttpResponse.json(sentReadFixture);
    }
    return HttpResponse.json(notFoundError, { status: 404 });
  }),
  http.get(`${BASE}/thread/:conversationId`, ({ params }) => {
    if (params.conversationId === threadFixture.conversation_id) {
      return HttpResponse.json(threadFixture);
    }
    return HttpResponse.json(notFoundError, { status: 404 });
  }),
  http.get(`${BASE}/directory`, () => HttpResponse.json(directoryListFixture)),
  http.get(`${BASE}/directory/:address`, ({ params }) => {
    if (params.address === directoryShowFixture.address.address) {
      return HttpResponse.json(directoryShowFixture);
    }
    return HttpResponse.json(notFoundError, { status: 404 });
  }),
  http.get(`${BASE}/directory/:address/members`, () =>
    HttpResponse.json(directoryMembersFixture),
  ),
];
