import type { Step } from "../shared/models";
import { MessageType, type RecordStepMessage, type StartRecordingMessage, type StopRecordingMessage } from "../shared/messageTypes";
import { randomId } from "../shared/utils";
import { buildSelectorInfo } from "./selectors";

let recording = false;

function sendStep(step: Step) {
  const message: RecordStepMessage = { type: MessageType.RecordStep, step };
  chrome.runtime.sendMessage(message);
}

function handleClick(event: MouseEvent) {
  if (!recording) return;
  const target = event.target as Element | null;
  if (!target) return;
  const step: Step = {
    id: randomId("step"),
    type: "click",
    selector: buildSelectorInfo(target),
    urlPattern: window.location.href,
    meta: { tag: target.tagName.toLowerCase() }
  };
  sendStep(step);
}

function handleInput(event: Event) {
  if (!recording) return;
  const target = event.target as HTMLInputElement | HTMLTextAreaElement | null;
  if (!target) return;
  const step: Step = {
    id: randomId("step"),
    type: "input",
    selector: buildSelectorInfo(target),
    value: target.value,
    urlPattern: window.location.href,
    meta: { tag: target.tagName.toLowerCase() }
  };
  sendStep(step);
}

function handleSubmit(event: Event) {
  if (!recording) return;
  const target = event.target as Element | null;
  if (!target) return;
  const step: Step = {
    id: randomId("step"),
    type: "submit",
    selector: buildSelectorInfo(target),
    urlPattern: window.location.href,
    meta: { tag: target.tagName.toLowerCase() }
  };
  sendStep(step);
}

function addListeners() {
  document.addEventListener("click", handleClick, true);
  document.addEventListener("input", handleInput, true);
  document.addEventListener("change", handleInput, true);
  document.addEventListener("submit", handleSubmit, true);
}

function removeListeners() {
  document.removeEventListener("click", handleClick, true);
  document.removeEventListener("input", handleInput, true);
  document.removeEventListener("change", handleInput, true);
  document.removeEventListener("submit", handleSubmit, true);
}

function startRecording() {
  if (recording) return;
  recording = true;
  addListeners();
}

function stopRecording() {
  if (!recording) return;
  recording = false;
  removeListeners();
}

chrome.runtime.onMessage.addListener((message: StartRecordingMessage | StopRecordingMessage) => {
  if (message.type === MessageType.StartRecording) {
    startRecording();
  } else if (message.type === MessageType.StopRecording) {
    stopRecording();
  }
});

// Expose state for debugging if needed
export function isRecording() {
  return recording;
}


