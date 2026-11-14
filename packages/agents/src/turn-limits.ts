export const CODING_MAX_TURNS = 200;

export const HAND_OFF_TURN = 100;

export const HAND_OFF_NOTICE = `This is an automatic notice from Aven, not from the person: you have used ${HAND_OFF_TURN} of your ${CODING_MAX_TURNS} turns. If the task is still complex or has a lot of work left, stop doing it yourself and call define_goal now: write the objective so a stranger could carry on (what was asked, what is done, what is left), with observable acceptance criteria and verify commands. A run that reaches ${CODING_MAX_TURNS} turns is cut off in the middle of its work. If you are close to done, finish and ignore this.`;
