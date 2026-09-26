// 界面层的状态钩子：把数据层动作接到 React 状态上。
import { useCallback, useEffect, useRef, useState } from "react";
import type { ConsoleData } from "../domain/types";
import { loadData, resetData, saveData, type ActionResult } from "../data/store";

export type Run = (action: (current: ConsoleData) => ActionResult) => void;

export function useConsole() {
  const [data, setData] = useState<ConsoleData>(loadData);
  const [notice, setNotice] = useState("");
  const dataRef = useRef(data);
  dataRef.current = data;

  useEffect(() => {
    saveData(data);
  }, [data]);

  useEffect(() => {
    if (!notice) {
      return;
    }
    const timer = window.setTimeout(() => setNotice(""), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const run = useCallback<Run>((action) => {
    const result = action(dataRef.current);
    dataRef.current = result.data;
    setData(result.data);
    setNotice(result.notice);
  }, []);

  const reset = useCallback(() => {
    const fresh = resetData();
    dataRef.current = fresh;
    setData(fresh);
    setNotice("已重置为演示数据");
  }, []);

  return { data, notice, run, reset };
}
