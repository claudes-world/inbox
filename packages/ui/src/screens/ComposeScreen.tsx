/**
 * Compose Screen — create new messages or reply to existing ones.
 */
import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { fetchMessage, postSend, postReply } from "../api.js";
import { Button } from "../components/primitives/Button.js";

export function ComposeScreen({
  address,
  replyToId,
  navigate,
}: {
  address: string;
  replyToId?: string;
  navigate: (hash: string) => void;
}) {
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [urgency, setUrgency] = useState("normal");
  const [successMsg, setSuccessMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  const isReply = !!replyToId;

  // Fetch original message for reply mode
  const { data: replyData } = useQuery({
    queryKey: ["message", address, replyToId],
    queryFn: () => fetchMessage(address, replyToId!),
    enabled: isReply && !!address,
  });

  // Pre-fill subject for replies
  useEffect(() => {
    if (replyData?.message) {
      const origSubject = replyData.message.subject;
      if (!origSubject.startsWith("Re: ")) {
        setSubject(`Re: ${origSubject}`);
      } else {
        setSubject(origSubject);
      }
      setTo(replyData.message.sender);
    }
  }, [replyData]);

  const sendMutation = useMutation({
    mutationFn: async (): Promise<{ message_id: string }> => {
      if (isReply && replyToId) {
        return postReply(address, replyToId, { body, subject, urgency });
      }
      return postSend(address, { to, cc: cc || undefined, subject, body, urgency });
    },
    onSuccess: (data) => {
      setErrorMsg("");
      setSuccessMsg(`Message sent: ${data.message_id}`);
      setTimeout(() => navigate("/"), 1500);
    },
    onError: (err) => {
      setSuccessMsg("");
      setErrorMsg(err instanceof Error ? err.message : "Send failed");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setSuccessMsg("");

    if (!isReply && !to.trim()) {
      setErrorMsg("To field is required");
      return;
    }

    sendMutation.mutate();
  };

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-zinc-800 bg-zinc-950">
        <Button variant="ghost" onClick={() => navigate("/")}>
          &larr; Back
        </Button>
        <h2 className="text-sm font-semibold text-zinc-200">
          {isReply ? "Reply" : "Compose"}
        </h2>
        {isReply && replyToId && (
          <span className="text-xs font-mono text-zinc-600 truncate">
            {replyToId}
          </span>
        )}
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="px-4 py-4 space-y-4">
        {/* To */}
        {!isReply && (
          <div className="space-y-1">
            <label className="text-xs text-zinc-500 font-semibold uppercase tracking-wider">
              To
            </label>
            <input
              type="text"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="user@host, user2@host"
              className="w-full bg-zinc-900 text-zinc-200 border border-zinc-700 rounded px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-none"
            />
          </div>
        )}

        {isReply && (
          <div className="text-xs text-zinc-500">
            Replying to: <span className="text-zinc-300">{to}</span>
          </div>
        )}

        {/* CC */}
        {!isReply && (
          <div className="space-y-1">
            <label className="text-xs text-zinc-500 font-semibold uppercase tracking-wider">
              CC (optional)
            </label>
            <input
              type="text"
              value={cc}
              onChange={(e) => setCc(e.target.value)}
              placeholder="user@host"
              className="w-full bg-zinc-900 text-zinc-200 border border-zinc-700 rounded px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-none"
            />
          </div>
        )}

        {/* Subject */}
        <div className="space-y-1">
          <label className="text-xs text-zinc-500 font-semibold uppercase tracking-wider">
            Subject
          </label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Message subject"
            className="w-full bg-zinc-900 text-zinc-200 border border-zinc-700 rounded px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>

        {/* Body */}
        <div className="space-y-1">
          <label className="text-xs text-zinc-500 font-semibold uppercase tracking-wider">
            Body
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Message body..."
            rows={12}
            className="w-full bg-zinc-900 text-zinc-200 border border-zinc-700 rounded px-3 py-2 text-sm font-mono leading-relaxed focus:border-blue-500 focus:outline-none resize-y"
          />
        </div>

        {/* Urgency */}
        <div className="space-y-1">
          <label className="text-xs text-zinc-500 font-semibold uppercase tracking-wider">
            Urgency
          </label>
          <select
            value={urgency}
            onChange={(e) => setUrgency(e.target.value)}
            className="bg-zinc-900 text-zinc-200 border border-zinc-700 rounded px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>

        {/* Status */}
        {errorMsg && (
          <div className="text-sm text-red-400 bg-red-950/30 border border-red-900 rounded px-3 py-2">
            {errorMsg}
          </div>
        )}
        {successMsg && (
          <div className="text-sm text-green-400 bg-green-950/30 border border-green-900 rounded px-3 py-2">
            {successMsg}
          </div>
        )}

        {/* Submit */}
        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            disabled={sendMutation.isPending}
          >
            {sendMutation.isPending
              ? "Sending..."
              : isReply
                ? "Send Reply"
                : "Send Message"}
          </Button>
          <Button
            variant="ghost"
            onClick={() => navigate("/")}
          >
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
