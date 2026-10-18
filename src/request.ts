import { z } from 'zod';
import { effort, tier } from './config.js';
import { compileToolValidators } from './tools.js';

const name = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/);
const toolCall = z.object({
  id: z.string().min(1).max(200), type: z.literal('function'),
  function: z.object({name, arguments: z.string().max(100000)}).strict(),
}).strict();
const textMessage = z.object({
  role: z.enum(['system','developer','user']), content: z.string().max(100000),
  name: name.optional(),
}).strict();
const assistantMessage = z.object({
  role: z.literal('assistant'), content: z.string().max(100000).nullable().optional(),
  tool_calls: z.array(toolCall).min(1).max(64).optional(), name: name.optional(),
}).strict();
const resultMessage = z.object({
  role: z.literal('tool'), content: z.string().max(100000), tool_call_id: z.string().min(1).max(200),
  name: name.optional(),
}).strict();
export const chatSchema = z.object({
  model: z.string().min(1).optional(),
  messages: z.array(z.union([textMessage,assistantMessage,resultMessage])).min(1).max(100),
  tools: z.array(z.object({type:z.literal('function'),function:z.object({
    name, description:z.string().max(10000).optional(),
    parameters:z.record(z.string(),z.unknown()).optional(), strict:z.boolean().optional(),
  }).strict()}).strict()).max(64).optional(),
  tool_choice:z.union([z.enum(['auto','none','required']),z.object({
    type:z.literal('function'),function:z.object({name}).strict(),
  }).strict()]).optional(),
  parallel_tool_calls:z.boolean().optional(),
  stream: z.boolean().default(false),
  reasoning_effort: effort.optional(),
  service_tier: tier.optional(),
}).strict().superRefine((request,ctx)=>{
  const issue=(path:(string|number)[],message:string)=>ctx.addIssue({code:'custom',path,message});
  const names=request.tools?.map(tool=>tool.function.name) ?? [];
  if(new Set(names).size!==names.length) issue(['tools'],'Tool names must be unique');
  if(request.tool_choice==='required' && !names.length) issue(['tool_choice'],'Tools are required');
  if(typeof request.tool_choice==='object' && !names.includes(request.tool_choice.function.name)) issue(['tool_choice'],'Unknown tool');
  try { compileToolValidators(request); } catch { issue(['tools'],'Invalid or unsupported tool parameter JSON Schema'); }
  // Each result must match a pending call; prevent lost, duplicated or orphaned results.
  const pending=new Set<string>(),seen=new Set<string>();
  for(const [index,message] of request.messages.entries()) {
    if(message.role==='tool') {
      if(!pending.delete(message.tool_call_id)) issue(['messages',index],'Unknown or duplicate tool_call_id');
      continue;
    }
    if(pending.size) issue(['messages',index],'Missing tool results before next message');
    if(message.role==='assistant') {
      if(message.content==null && !message.tool_calls) issue(['messages',index],'Assistant needs content or tool_calls');
      for(const call of message.tool_calls ?? []) {
        if(seen.has(call.id)) issue(['messages',index],'Duplicate tool call ID');
        seen.add(call.id);pending.add(call.id);
        try {
          const args:unknown=JSON.parse(call.function.arguments);
          if(!args || typeof args!=='object' || Array.isArray(args)) throw new Error();
        } catch { issue(['messages',index],'Tool arguments must be a JSON object'); }
      }
    }
  }
  if(pending.size) issue(['messages'],'Missing tool results');
});
export type ChatRequest = z.infer<typeof chatSchema>;

// The CLI takes one prompt. Preserve history explicitly; never reuse a persisted thread.
export function promptFor(request: ChatRequest): string {
  const tools=request.tools?.length && request.tool_choice!=='none';
  const instruction=tools
    ? 'Choose the next assistant action. Return the required JSON object with content (text, or empty string) and tool_calls (array of name and arguments). arguments is a JSON-encoded object matching the selected function parameters. Never execute tools yourself. Use tool results in the conversation; do not repeat completed calls unless needed. If no call is needed, return the answer in content and an empty tool_calls array.\nFunction definitions (JSON):\n'+JSON.stringify(request.tools)+'\nTool choice: '+JSON.stringify(request.tool_choice ?? 'auto')+'\n'+(request.parallel_tool_calls===false?'Return at most one tool call.\n':'')
    : 'Answer the final user message using the conversation below. Return only the assistant answer. Do not use tools.\n';
  return instruction+'Conversation (JSON):\n'+JSON.stringify(request.messages);
}
