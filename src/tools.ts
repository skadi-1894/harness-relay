import { randomUUID } from 'node:crypto';
import { Ajv, type ValidateFunction } from 'ajv';
import { default as addFormats } from 'ajv-formats';
import { z } from 'zod';
import type { ChatRequest } from './request.js';
import { type Completion, ProviderError } from './completion.js';

export interface ToolCall {
  id:string; type:'function'; function:{name:string;arguments:string};
}
export function compileToolValidators(request: Pick<ChatRequest,'tools'>):Map<string,ValidateFunction> {
  const ajv=new Ajv({strict:false,strictSchema:true,logger:false,validateFormats:true,addUsedSchema:false});
  addFormats.default(ajv);
  return new Map((request.tools ?? []).map(tool=>{
    const schema=tool.function.parameters ?? {type:'object',properties:{}};
    if(schema.$async) throw new Error('Async schemas are not supported');
    const validator=ajv.compile(schema);
    if('$async' in validator && validator.$async) throw new Error('Async schemas are not supported');
    return [tool.function.name,validator];
  }));
}
export function toolOutputSchema(request:ChatRequest):Record<string,unknown>|undefined {
  if(!request.tools?.length || request.tool_choice==='none') return;
  const names=typeof request.tool_choice==='object' ? [request.tool_choice.function.name] : request.tools.map(tool=>tool.function.name);
  return {type:'object',additionalProperties:false,required:['content','tool_calls'],properties:{
    content:{type:'string'},tool_calls:{type:'array',items:{type:'object',additionalProperties:false,
      required:['name','arguments'],properties:{name:{type:'string',enum:names},arguments:{type:'string'}}}},
  }};
}
const decision=z.object({content:z.string().max(100000),tool_calls:z.array(z.object({
  name:z.string(),arguments:z.string().max(100000),
}).strict()).max(64)}).strict();
export function applyToolOutput(request:ChatRequest,completion:Completion,output:unknown):Completion {
  try {
    const parsed=decision.parse(output);
    const validators=compileToolValidators(request);
    if((request.tool_choice==='required' || typeof request.tool_choice==='object') && !parsed.tool_calls.length) throw new Error();
    if(request.parallel_tool_calls===false && parsed.tool_calls.length>1) throw new Error();
    const toolCalls:ToolCall[]=parsed.tool_calls.map(call=>{
      if(typeof request.tool_choice==='object' && call.name!==request.tool_choice.function.name) throw new Error();
      const args:unknown=JSON.parse(call.arguments);
      if(!args || typeof args!=='object' || Array.isArray(args) || !validators.get(call.name)?.(args)) throw new Error();
      return {id:`call_${randomUUID().replaceAll('-','')}`,type:'function',function:{name:call.name,arguments:JSON.stringify(args)}};
    });
    return {...completion,text:parsed.content,...(toolCalls.length?{toolCalls}: {})};
  } catch { throw new ProviderError('upstream',completion); }
}
