import { describe, it, expect } from '@jest/globals';
import { chatSchema, promptFor } from '../src/request.js';
import { toolOutputSchema, applyToolOutput } from '../src/tools.js';
const tools=[{type:'function',function:{name:'weather',description:'Weather in a city',parameters:{type:'object',properties:{city:{type:'string'}},required:['city'],additionalProperties:false}}}];
const base={messages:[{role:'user',content:'Weather in Warsaw?'}],tools};
const usage={text:'internal JSON',input:3,cached:0,output:4};
const call={name:'weather',arguments:'{"city":"Warsaw"}'};
describe('client tool protocol',()=>{
  it('supports bind_tools payloads and generates constrained output without execution',()=>{
    const request=chatSchema.parse({...base,tools:[{...tools[0],function:{...tools[0].function,strict:true}}],tool_choice:{type:'function',function:{name:'weather'}},parallel_tool_calls:false});
    expect(toolOutputSchema(request)).toMatchObject({properties:{tool_calls:{items:{properties:{name:{enum:['weather']}}}}}});
    expect(promptFor(request)).toContain('Never execute tools yourself');
    const result=applyToolOutput(request,usage,{content:'',tool_calls:[call]});
    expect(result.toolCalls?.[0]).toMatchObject({id:expect.stringMatching(/^call_/),type:'function',function:call});
    const followup=chatSchema.parse({...base,messages:[...base.messages,{role:'assistant',content:null,tool_calls:result.toolCalls},{role:'tool',tool_call_id:result.toolCalls![0].id,content:'Sunny, 20C'}]});
    expect(promptFor(followup)).toContain('Sunny, 20C');
  });
  it('supports empty tools and tool_choice none without structured output',()=>{
    expect(toolOutputSchema(chatSchema.parse({...base,tools:[]}))).toBeUndefined();
    expect(toolOutputSchema(chatSchema.parse({...base,tool_choice:'none'}))).toBeUndefined();
  });
  it.each([
    {...base,tool_choice:'required',tools:[]},
    {...base,tool_choice:{type:'function',function:{name:'missing'}}},
    {...base,tools:[tools[0],tools[0]]},
    {...base,tools:[{type:'function',function:{name:'bad',parameters:{type:'invalid'}}}]},
    {...base,tools:[{type:'function',function:{name:'bad',parameters:{$ref:'https://example.com/schema'}}}]},
    {...base,tools:[{type:'function',function:{name:'bad',parameters:{$async:true}}}]},
    {...base,tools:[{type:'function',function:{name:'bad',parameters:{type:'string',format:'unknown-format'}}}]},
    {messages:[{role:'tool',tool_call_id:'orphan',content:'oops'}]},
    {messages:[{role:'assistant',content:null}]},
    {messages:[{role:'assistant',tool_calls:[{id:'a',type:'function',function:call}]}]},
    {messages:[{role:'assistant',tool_calls:[{id:'a',type:'function',function:call}]},{role:'tool',tool_call_id:'a',content:'ok'},{role:'tool',tool_call_id:'a',content:'duplicate'}]},
  ])('rejects invalid requests before upstream: %j',value=>{
    expect(chatSchema.safeParse(value).success).toBe(false);
  });
  it.each([
    {content:'',tool_calls:[{...call,name:'invented'}]},
    {content:'',tool_calls:[{...call,arguments:'not json'}]},
    {content:'',tool_calls:[{...call,arguments:'{"city":123}'}]},
    {content:'',tool_calls:[{...call,arguments:'{}'}]},
    {content:'',tool_calls:[{...call,arguments:'{"city":"Warsaw","extra":true}'}]},
    {content:'secret malformed envelope'},
  ])('rejects bad provider output without losing token usage',output=>{
    expect(()=>applyToolOutput(chatSchema.parse(base),usage,output)).toThrow('Provider upstream failure');
    try { applyToolOutput(chatSchema.parse(base),usage,output); } catch(error) { expect(error).toMatchObject({usage}); }
  });
  it('validates nested schemas, refs, optional values and formats',()=>{
    const request=chatSchema.parse({...base,tools:[{type:'function',function:{name:'weather',parameters:{
      type:'object',$defs:{city:{type:'string'}},properties:{city:{$ref:'#/$defs/city'},date:{type:['string','null'],format:'date'}},required:['city'],additionalProperties:false,
    }}}]});
    expect(applyToolOutput(request,usage,{content:'',tool_calls:[call]}).toolCalls).toHaveLength(1);
    expect(()=>applyToolOutput(request,usage,{content:'',tool_calls:[{...call,arguments:'{"city":"Warsaw","date":"bad"}'}]})).toThrow();
  });
  it('enforces required and parallel limits and accepts final answers',()=>{
    expect(()=>applyToolOutput(chatSchema.parse({...base,tool_choice:'required'}),usage,{content:'No call',tool_calls:[]})).toThrow();
    expect(()=>applyToolOutput(chatSchema.parse({...base,parallel_tool_calls:false}),usage,{content:'',tool_calls:[call,call]})).toThrow();
    const multiple=applyToolOutput(chatSchema.parse(base),usage,{content:'',tool_calls:[call,call]});
    expect(new Set(multiple.toolCalls!.map(c=>c.id)).size).toBe(2);
    expect(applyToolOutput(chatSchema.parse(base),usage,{content:'Sunny',tool_calls:[]})).toEqual({...usage,text:'Sunny'});
  });
});
