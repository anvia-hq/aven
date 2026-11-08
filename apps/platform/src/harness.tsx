import { createRoot } from "react-dom/client";
import { useState } from "react";
import "./index.css";
import { Question } from "@/modules/threads/components/question-form";
const prompt={id:"q",text:"Which do you want?",allowCustom:true,choices:[{value:"a",label:"All six as proposed (recommended)"},{value:"b",label:"Only Check, Typecheck, Test"},{value:"c",label:"Let me list them"}]} as any;
const Box=({init}:{init:any})=>{const [d,setD]=useState(init);return <div className="p-4"><Question prompt={prompt} draft={d} onChange={setD}/></div>};
createRoot(document.getElementById("root")!).render(<><Box init={{choice:"b",custom:""}}/><Box init={{choice:"",custom:"Only the tests"}}/></>);
