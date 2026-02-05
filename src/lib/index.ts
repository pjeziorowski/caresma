// place files you want to import through the `$lib` alias in this folder.

// Caresma Components
export { default as Avatar } from './components/Avatar.svelte';
export { default as VoiceRecorder } from './components/VoiceRecorder.svelte';
export { default as ChatHistory } from './components/ChatHistory.svelte';

// Types
export type { AvatarState } from './components/Avatar.svelte';
export type { ChatMessage } from './components/ChatHistory.svelte';

// Stores
export { conversation } from './stores/conversation.svelte';
