// Card values in a deck. `?` means "no idea".
export type Card = number | '?';

// A participant as the realtime server serializes it for us. Note `vote` is
// null unless the round is revealed or it's your own vote.
export interface Participant {
	userId: string;
	name: string;
	role: 'moderator' | 'voter' | 'observer';
	connected: boolean;
	hasVoted: boolean;
	vote: Card | null;
}

// The full room state pushed by the server on every change.
export interface RoomState {
	id: string;
	moderatorId: string;
	ticket: string | null;
	revealed: boolean;
	deck: Card[];
	youAreModerator: boolean;
	participants: Participant[];
}
