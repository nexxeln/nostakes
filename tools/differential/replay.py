# /// script
# requires-python = ">=3.14"
# dependencies = ["pokerkit==0.7.7"]
# ///
import json
import os
import sys
import traceback
import warnings
from collections import Counter, defaultdict, deque
from concurrent.futures import ProcessPoolExecutor
from importlib.metadata import version

from pokerkit import (
    Automation,
    BettingStructure,
    Card,
    Deck,
    Mode,
    Opening,
    StandardHighHand,
    State,
    Street,
)

POKERKIT_VERSION = version("pokerkit")

CARDS = [next(iter(Card.parse("23456789TJQKA"[c >> 2] + "cdhs"[c & 3]))) for c in range(52)]

CARD_NUMBERS = {card: number for number, card in enumerate(CARDS)}

AUTOMATIONS = (
    Automation.ANTE_POSTING,
    Automation.BET_COLLECTION,
    Automation.BLIND_OR_STRADDLE_POSTING,
    Automation.CARD_BURNING,
    Automation.CHIPS_PULLING,
)

BENIGN_WARNINGS = ("There is no reason for this player to fold.",)

NOBODY_CAN_CALL = "There is no reason to complete, bet, or raise"

ALREADY_ACTED = "The player already acted and hence cannot raise"

CONFIGURATIONS = {
    "no-burn-cards": (
        "Brief rule 9 deals without burn cards. The replay builds PokerKit streets "
        "with no burns and deals every card explicitly from the exported deck."
    ),
    "straddle-sizes-preflop-raise": (
        "Brief rule 8 makes the last straddle the big blind for sizing before the flop. "
        "The replay sets PokerKit's pre-flop minimum raise to the last straddle."
    ),
    "big-blind-ante-blind-first": (
        "Brief rule 4 and TDA RP-11 (2024) take the big blind before the big-blind ante. "
        "PokerKit posts antes first, so the replay passes the ante the big blind can "
        "still pay after its blind."
    ),
    "runs-agreed-smallest": (
        "Brief rule 19 runs the board the smallest number anyone chose. PokerKit runs "
        "once unless every choice agrees, so the replay gives every selector the agreed number."
    ),
    "one-run-ends-choice": (
        "Brief rule 19 as amended runs the board once as soon as any seat chooses one run, "
        "without waiting for the rest. PokerKit waits for every selector, so the replay "
        "answers the seats the engine never asked with one run."
    ),
    "fixed-runs": (
        "With runCount Fixed the engine runs the board the most times the cap allows "
        "without asking anyone. The replay answers PokerKit's run question with that "
        "count, after checking it against the cap from the remaining deck."
    ),
    "one-run-no-choice": (
        "With maxRuns 1 the brief skips the run choice. PokerKit cash games still ask, "
        "so the replay answers no preference, which is one run."
    ),
    "complete-board-show-or-muck": (
        "Brief rules 23 to 25 let a beaten hand muck at a complete-board showdown even "
        "when a seat is all in. PokerKit's automation tables every hand once anyone is "
        "all in (TDA Rule 17 does the same for tournaments), so the replay asks PokerKit's "
        "can_win_now for each seat in PokerKit's own showdown order."
    ),
    "pokerkit-dead-check": (
        "PokerKit gives a seat a turn when it owes nothing and no other seat can act, for "
        "example the big blind's option against seats that are all in. Brief rule 13 ends "
        "the street without asking. The replay checks for that seat in PokerKit."
    ),
    "uncontested-winner-unshown": (
        "The interactive showdown never asks a seat that is the last claimant of every pot "
        "it can win, and its cards stay hidden. PokerKit asks every seat in its showdown "
        "order, so the replay shows that hand in PokerKit after checking that no other live "
        "seat shares a pot with it. Showing it changes no award."
    ),
    "interactive-show-or-muck": (
        "With showdown Interactive each seat asked tables or mucks by its own choice. The "
        "replay passes the engine's choice to PokerKit's show_or_muck_hole_cards in "
        "PokerKit's own showdown order, compares whose turn it is and the seat's "
        "beatenInEveryPot fact against PokerKit's can_win_now, and pays the pots among the "
        "seats PokerKit still has live."
    ),
    "heads-up-equal-blinds-opener": (
        "PokerKit breaks a tie between equal blinds toward the higher player index, so "
        "heads-up with equal blinds it opens with the big blind. Brief rule 2 and TDA "
        "Rule 36-C have the button act first, so the replay moves PokerKit's first actor "
        "to the button."
    ),
}

EXCLUSIONS = {
    "short-big-blind": (
        "Brief rule 7 keeps the call and the minimum raise at the full big blind when the "
        "big blind posts short and another seat can still act. PokerKit sizes from the "
        "chips actually posted. Pre-flop betting is compared up to the first decision where "
        "the two sizes differ, and the rest of the hand is not compared. A difference at a "
        "decision where no other seat can act is not excluded."
    ),
    "pokerkit-short-all-in-reopens": (
        "PokerKit lets a seat that already acted raise after all-in wagers that add up to "
        "less than a full bet or raise, because it counts the first short wager of a street "
        "as a full one. TDA Rule 49-A says that seat may not raise. Only raise availability "
        "is skipped at these decisions."
    ),
    "pokerkit-forgets-added-short-all-ins": (
        "PokerKit adds up short all-ins only until they reach a full raise, then starts the "
        "sum again, so a later short all-in closes the betting for a seat that already faces "
        "more than a full raise in total. TDA Rule 49-A counts cumulative short all-ins, so "
        "that seat may raise. Only raise availability is skipped at these decisions."
    ),
    "pokerkit-refuses-raise-nobody-can-call": (
        "PokerKit refuses a raise when no other live seat can put in more than the current "
        "bet. The brief allows it and returns the uncalled excess (rule 15). The engine's "
        "raise is replayed in PokerKit as a call, and a river showdown order after it is "
        "not compared."
    ),
    "muck-keeps-uncontested-pot": (
        "The interactive showdown lets a seat muck the pots other seats still contest and "
        "keep a pot every other claimant has already mucked (rule 4 of the showdown brief). "
        "PokerKit's muck forfeits every pot, so that pot would have no live seat. The rest "
        "of the hand is not compared."
    ),
    "all-in-hands-hidden": (
        "With allInHands Hidden the engine deals an all-in run-out without tabling and "
        "shows or mucks once the board is complete. PokerKit always tables every hand "
        "before an all-in run-out. The replay lets PokerKit table, compares the boards, "
        "the pots, and the awards, and skips the tabling, the show-or-muck order, and the "
        "interactive choices. When a seat mucks at an interactive showdown after a hidden "
        "run-out it may concede a pot it could have won, so that hand's awards are not "
        "compared either."
    ),
    "showdown-order-last-aggressor": (
        "With showdownOrder LastAggressor the last seat to bet or raise on any street "
        "shows first. PokerKit starts with the last aggressor on the river only. When the "
        "two orders differ, the show-or-muck order and the interactive choices are not "
        "compared; the pots and awards still are, except after an interactive showdown, "
        "whose choices PokerKit could not replay."
    ),
    "casino-blind-posting": (
        "With blindPosting Casino a seat that owes a blind waits for the big blind or posts "
        "to come in, a missed small blind is posted dead, and the button is a dead button. "
        "PokerKit has no seats outside the hand, no dead money but antes, and no dead "
        "button. A hand whose dealt-in seats, button, or blinds differ from the moving "
        "button, or that has a post to come in, is not compared; the table model and the "
        "simulator check these rules. Other Casino hands are compared in full."
    ),
    "odd-chip-spread": (
        "PokerKit gives a pot's whole remainder to the first run and to the first winner. "
        "Brief rules 17 and 22 hand leftover chips out one at a time. Awards and final "
        "stacks are compared against the brief's split of PokerKit's own pots and winners."
    ),
}

REPLAY_ONLY = {
    "button-and-blinds": "Brief rules 1 and 2, recomputed from the seat snapshot. PokerKit has no table or button model.",
    "straddle-list": "Brief rule 8, recomputed for accepted and rejected straddle lists. PokerKit takes any blind list.",
    "run-cap": "Brief rule 19's cap of maxRuns and the remaining deck. PokerKit has no cap.",
    "rabbit-hunt": (
        "Brief rule 27, the next undealt cards from the exported deck, and with rabbitHunters "
        "StillIn that only a seat that never folded may hunt. PokerKit has no rabbit hunt."
    ),
    "voluntary-show": (
        "Brief rule 26, legality of after-hand shows, and with voluntaryShows BothCards that "
        "a show leaves no hole card hidden. PokerKit has no after-hand shows."
    ),
    "showdown-must-table": (
        "Showdown brief rule 3, that a seat must table a hand that beats or ties the tabled "
        "hands of a pot another live seat contests. PokerKit lets any seat muck."
    ),
}


SETTING_CHOICES = {
    "allInHands": {"FaceUp", "Hidden"},
    "blindPosting": {"HomeGame", "Casino"},
    "rabbitHunters": {"DealtIn", "StillIn"},
    "runCount": {"Vote", "Fixed"},
    "showdown": {"Automatic", "Interactive"},
    "showdownOrder": {"RiverAggressor", "LastAggressor"},
    "straddleSize": {"Doubling", "TwoBigBlinds"},
    "voluntaryShows": {"EitherCard", "BothCards"},
}

ANTE_FIELDS = {"BigBlindPays": {"_tag", "amount"}, "EveryPlayer": {"_tag", "amount"}, "NoAnte": {"_tag"}}


def known_setting(key, value):
    match key:
        case "bigBlind" | "maxRuns" | "smallBlind":
            return type(value) is int
        case "rabbitHunt":
            return type(value) is bool
        case "ante":
            return isinstance(value, dict) and ANTE_FIELDS.get(value.get("_tag")) == set(value)
        case "straddle":
            return isinstance(value, dict) and set(value) == {"button", "underTheGun"}
        case _:
            return value in SETTING_CHOICES.get(key, ())


def unknown_settings(record):
    configs = [record["config"]]
    configs += [rejected["config"] for rejected in record["rejectedStarts"]]
    configs += [step["config"] for step in record["after"]]
    return sorted(
        {f"{key}={json.dumps(value)}" for config in configs for key, value in config.items() if not known_setting(key, value)}
    )


class Hand:
    def __init__(self, record):
        self.record = record
        self.config = record["config"]
        self.small_blind = self.config["smallBlind"]
        self.big_blind = self.config["bigBlind"]
        self.max_runs = self.config["maxRuns"]
        self.deck = record["deck"]
        self.straddles = record["straddles"]
        self.differences = []
        self.configured = set()
        self.excluded = set()
        self.replay_checked = set()
        self.features = set()
        self.stopped = None
        self.state = None
        self.showdown = []
        engine_events = list(self.events())
        started_showdowns = [e for e in engine_events if e["_tag"] == "ShowdownStarted"]
        self.interactive = started_showdowns[0]["order"] if started_showdowns else None
        agreed_runs = [e["runs"] for e in engine_events if e["_tag"] == "RunsAgreed"]
        self.fixed_runs = agreed_runs[0] if self.config.get("runCount") == "Fixed" and agreed_runs else None
        self.hidden_run_out = self.config.get("allInHands") == "Hidden" and any(
            e["_tag"] == "RunsAgreed" for e in engine_events
        )
        self.engine_choices = {
            e["seat"]: e["_tag"] == "HandTabled" for e in engine_events if e["_tag"] in ("HandTabled", "HandMucked")
        }
        self.order_checked = False
        self.board_deals = []
        self.pushes = []
        self.pots = None
        self.choices = {}
        self.agreed = None
        self.selectors = None
        self.river_call_for_raise = False
        self.reference = None
        self.engine_preflop = True
        self.engine_folded = set()
        self.engine_all_in = set()
        self.winner_cache = {}
        self.short_big_blind = not record["straddles"] and not any(
            e["_tag"] == "BlindPosted" and e["blind"] == "Big" and e["amount"] == self.big_blind for e in record["start"]
        )

    def differ(self, category, detail):
        self.differences.append((category, detail))

    def stop(self, reason):
        if self.stopped is None:
            self.stopped = reason

    def events(self):
        yield from self.record["start"]
        for step in self.record["steps"]:
            yield from step["events"]

    def started(self):
        return self.record["start"][0]

    def casino_differs(self, started):
        if self.config.get("blindPosting") != "Casino":
            return False
        seats = self.record["seats"]
        dealt = [i for i, seat in enumerate(seats) if seat is not None and not seat["sittingOut"] and seat["stack"] > 0]
        posted = any(
            e["_tag"] == "BlindPosted"
            and (e.get("dead", False) or (e["blind"] == "Big" and e["seat"] != started["bigBlindSeat"]))
            for e in self.record["start"]
        )
        if dealt != started["dealtIn"] or posted:
            return True
        previous = self.record["previousButton"]
        button = dealt[0] if previous is None else next_after(dealt, previous)
        small = button if len(dealt) == 2 else next_after(dealt, button)
        big = next_after(dealt, small)
        return (button, small, big) != (started["button"], started["smallBlindSeat"], started["bigBlindSeat"])

    def run(self):
        started = self.started()
        if self.config.get("blindPosting") == "Casino":
            self.features.add("casino-blinds")
            if self.casino_differs(started):
                self.excluded.add("casino-blind-posting")
                self.stop("casino-blind-posting")
                return
        self.button = started["button"]
        self.check_table(started)
        self.check_rejected_starts()
        self.order = [s for s in started["dealtIn"] if s > self.button] + [
            s for s in started["dealtIn"] if s <= self.button
        ]
        self.index = {seat: i for i, seat in enumerate(self.order)}
        self.count = len(self.order)
        self.collect_features()
        self.build_state(started)
        self.check_postings()
        self.deal_hole_cards()
        self.note_engine_events(self.record["start"])
        self.advance()
        for step in self.record["steps"]:
            if self.stopped is not None:
                break
            tag = step["command"]["_tag"]
            if tag == "Act":
                self.act(step)
            elif tag == "ChooseRuns":
                self.choose(step)
            elif tag in ("TableHand", "MuckHand"):
                self.choose_at_showdown(step)
            self.note_engine_events(step["events"])
            self.advance()
        if self.stopped is None:
            self.finish()
        self.check_after_hand()

    def check_table(self, started):
        seats = self.record["seats"]
        dealt = [i for i, seat in enumerate(seats) if seat is not None and not seat["sittingOut"] and seat["stack"] > 0]
        self.replay_checked.add("button-and-blinds")
        if dealt != started["dealtIn"]:
            self.differ("dealt-in", f"replay {dealt}, engine {started['dealtIn']}")
            return
        previous = self.record["previousButton"]
        button = dealt[0] if previous is None else next_after(dealt, previous)
        small = button if len(dealt) == 2 else next_after(dealt, button)
        big = next_after(dealt, small)
        if (button, small, big) != (started["button"], started["smallBlindSeat"], started["bigBlindSeat"]):
            self.differ(
                "button-and-blinds",
                f"replay button {button} sb {small} bb {big}, engine button {started['button']} "
                f"sb {started['smallBlindSeat']} bb {started['bigBlindSeat']}",
            )
        problem = straddle_problem(self.config, seats, dealt, button, self.straddles)
        self.replay_checked.add("straddle-list")
        if problem is not None:
            self.differ("straddle-list", f"engine accepted {self.straddles}, replay finds {problem}")

    def check_rejected_starts(self):
        for rejected in self.record["rejectedStarts"]:
            if rejected["config"].get("blindPosting") == "Casino":
                self.excluded.add("casino-blind-posting")
                continue
            seats = rejected["seats"]
            dealt = [i for i, seat in enumerate(seats) if seat is not None and not seat["sittingOut"] and seat["stack"] > 0]
            tag = rejected["rejection"]["tag"]
            self.replay_checked.add("straddle-list")
            if tag == "NotEnoughPlayers":
                if len(dealt) >= 2:
                    self.differ("start-rejected", f"NotEnoughPlayers with dealt-in seats {dealt}")
                continue
            if len(dealt) < 2:
                self.differ("start-rejected", f"{tag} with fewer than two dealt-in seats")
                continue
            previous = rejected["previousButton"]
            button = dealt[0] if previous is None else next_after(dealt, previous)
            problem = straddle_problem(rejected["config"], seats, dealt, button, rejected["straddles"])
            if tag != "StraddleNotAllowed" or problem is None:
                self.differ(
                    "straddle-list",
                    f"engine rejected {rejected['straddles']} with {rejected['rejection']}, replay finds {problem}",
                )

    def collect_features(self):
        self.features.add(f"seats-{self.count}")
        ante = self.config["ante"]["_tag"]
        self.features.add({"NoAnte": "ante-none", "EveryPlayer": "ante-every-player", "BigBlindPays": "ante-big-blind"}[ante])
        if not self.straddles:
            self.features.add("straddle-none")
        elif self.straddles == [self.button]:
            self.features.add("straddle-button")
        elif len(self.straddles) == 1:
            self.features.add("straddle-single")
        else:
            self.features.add("straddle-double")
        if self.count == 2:
            self.features.add("heads-up")
        if self.hidden_run_out:
            self.features.add("hidden-run-out")
        events = list(self.events())
        runs = [e["runs"] for e in events if e["_tag"] == "RunsAgreed"]
        tabled = any(e["_tag"] == "HandsTabled" for e in events)
        if runs:
            self.features.add(f"runs-{runs[0]}")
        elif tabled:
            self.features.add("runs-1")
        if any(e["_tag"] == "RaisedTo" and e["allIn"] and not e["full"] for e in events):
            self.features.add("short-all-in")
        awards = [e for e in events if e["_tag"] == "PotAwarded"]
        if any(e["pot"] > 1 for e in awards):
            self.features.add("side-pots")
        if any(len(e["winners"]) > 1 for e in awards):
            self.features.add("split-pots")
        if any(len({w["amount"] for w in e["winners"]}) > 1 for e in awards):
            self.features.add("odd-chips")
        showdowns = [e for e in events if e["_tag"] == "ShowdownReached"]
        self.features.add("showdown" if showdowns or self.interactive is not None else "fold-out")
        if any(entry["_tag"] == "Mucked" for e in showdowns for entry in e["order"]):
            self.features.add("mucks")
        if self.interactive is not None:
            self.features.add("interactive-showdown")
            choices = [e for e in events if e["_tag"] in ("HandTabled", "HandMucked")]
            if any(e["_tag"] == "HandMucked" for e in choices):
                self.features.add("mucks")
            if choices and choices[0]["_tag"] == "HandMucked":
                self.features.add("concession")
            tabled_seats = {e["seat"] for e in choices if e["_tag"] == "HandTabled"}
            if any(w["seat"] not in tabled_seats for e in awards for w in e["winners"]):
                self.features.add("unshown-winner")
        if any(not step["accepted"] for step in self.record["steps"]):
            self.features.add("rejected-commands")
        if not any(e["_tag"] == "BlindPosted" and e["blind"] == "Big" and e["amount"] == self.big_blind for e in events):
            self.features.add("short-big-blind")
        for step in self.record["after"]:
            if step["command"]["_tag"] == "RabbitHunt":
                self.features.add("rabbit-hunt")
            else:
                self.features.add("voluntary-show")

    def build_state(self, started):
        seats = self.record["seats"]
        stacks = [seats[seat]["stack"] for seat in self.order]
        ante = self.config["ante"]
        trimming = ante["_tag"] != "BigBlindPays"
        antes = 0
        if ante["_tag"] == "EveryPlayer":
            antes = ante["amount"]
        elif ante["_tag"] == "BigBlindPays":
            stack = stacks[self.index[started["bigBlindSeat"]]]
            paid = min(ante["amount"], stack - min(self.big_blind, stack))
            if paid < ante["amount"]:
                self.configured.add("big-blind-ante-blind-first")
            antes = {1: paid} if paid > 0 else 0
        blinds = [0] * self.count
        blinds[0] = self.small_blind
        blinds[1] = self.big_blind
        opening = self.big_blind
        for position, seat in enumerate(self.straddles):
            opening = straddle_amount(self.config, position)
            blinds[self.index[seat]] = opening
        if self.straddles:
            self.configured.add("straddle-sizes-preflop-raise")
        self.configured.add("no-burn-cards")
        self.opening = opening
        streets = (
            Street(False, (False, False), 0, False, Opening.POSITION, opening, None),
            Street(False, (), 3, False, Opening.POSITION, self.big_blind, None),
            Street(False, (), 1, False, Opening.POSITION, self.big_blind, None),
            Street(False, (), 1, False, Opening.POSITION, self.big_blind, None),
        )
        self.starting = stacks
        self.state = State(
            AUTOMATIONS,
            Deck.STANDARD,
            (StandardHighHand,),
            streets,
            BettingStructure.NO_LIMIT,
            trimming,
            antes,
            tuple(blinds),
            0,
            tuple(stacks),
            self.count,
            mode=Mode.CASH_GAME,
        )

    def check_postings(self):
        engine_antes = Counter()
        engine_live = Counter()
        for event in self.record["start"]:
            if event["_tag"] == "AntePosted":
                engine_antes[event["seat"]] += event["amount"]
            elif event["_tag"] in ("BlindPosted", "StraddlePosted"):
                engine_live[event["seat"]] += event["amount"]
        pokerkit_antes = Counter()
        pokerkit_live = Counter()
        for operation in self.state.operations:
            name = type(operation).__name__
            if name == "AntePosting":
                pokerkit_antes[self.order[operation.player_index]] += operation.amount
            elif name == "BlindOrStraddlePosting":
                pokerkit_live[self.order[operation.player_index]] += operation.amount
        if +engine_antes != +pokerkit_antes:
            self.differ("antes", f"engine {dict(engine_antes)}, pokerkit {dict(pokerkit_antes)}")
        if +engine_live != +pokerkit_live:
            self.differ("blinds-and-straddles", f"engine {dict(engine_live)}, pokerkit {dict(pokerkit_live)}")

    def deal_hole_cards(self):
        state = self.state
        for k in range(2 * self.count):
            dealee = state.hole_dealee_index
            if dealee != k % self.count:
                self.differ("hole-deal-order", f"card {k} goes to player {dealee}, expected {k % self.count}")
            state.deal_hole((CARDS[self.deck[k]],), dealee)
        self.hole = [[self.deck[i], self.deck[self.count + i]] for i in range(self.count)]
        for event in self.record["start"]:
            if event["_tag"] == "HoleCardsDealt":
                expected = self.hole[self.index[event["seat"]]]
                if event["cards"] != expected:
                    self.differ("hole-cards", f"seat {event['seat']} engine {event['cards']}, deck order {expected}")
        self.pointer = 2 * self.count
        if (
            self.count == 2
            and state.street_index == 0
            and state.actor_index == 0
            and state.bets[0] == state.bets[1]
            and 1 in state.actor_indices
        ):
            state.actor_indices = deque([1, 0])
            state.opener_index = 1
            self.configured.add("heads-up-equal-blinds-opener")

    def advance(self):
        state = self.state
        while state.status and self.stopped is None:
            if state.can_deal_board():
                count = state.board_dealing_count
                cards = self.deck[self.pointer : self.pointer + count]
                self.pointer += count
                state.deal_board(tuple(CARDS[c] for c in cards))
                self.board_deals.append(cards)
                continue
            if self.pots is None and (state.showdown_index is not None or state.can_kill_hand() or state.can_push_chips()):
                self.pots = [(pot.amount, tuple(self.order[i] for i in pot.player_indices)) for pot in state.pots]
                if any(not eligible for _, eligible in self.pots):
                    self.differ("unmatched-folded-chips", f"pokerkit pots {self.pots} include one no live seat can win")
                    self.stop("unmatched-folded-chips")
                    return
            if state.showdown_index is not None:
                player = state.showdown_index
                tabling = state.all_in_status and state.street is not state.streets[-1]
                if self.interactive is not None and not tabling:
                    if not self.check_showdown_order():
                        return
                    if self.order[player] in self.engine_choices:
                        return
                    self.show_unasked(player)
                    continue
                shows = True if tabling else state.can_win_now(player)
                if not tabling and state.all_in_status and not shows:
                    self.configured.add("complete-board-show-or-muck")
                state.show_or_muck_hole_cards(shows, player)
                self.showdown.append((self.order[player], shows, tabling))
                continue
            if any(state.runout_count_selector_statuses):
                selectors = [self.order[i] for i in state.runout_count_selector_indices]
                if self.selectors is None:
                    self.selectors = set(selectors)
                if self.max_runs == 1:
                    state.select_runout_count(None)
                    self.configured.add("one-run-no-choice")
                    continue
                if self.fixed_runs is not None:
                    self.check_fixed_cap()
                    state.select_runout_count(self.fixed_runs)
                    self.configured.add("fixed-runs")
                    continue
                if self.agreed is None:
                    return
                state.select_runout_count(self.agreed)
                continue
            if state.can_kill_hand():
                state.kill_hand()
                continue
            if state.can_push_chips():
                operation = state.push_chips()
                self.pushes.append(operation)
                continue
            return

    def reset_reference(self):
        state = self.state
        if self.reference is None or self.reference["street"] != state.street_index:
            preflop = state.street_index == 0
            self.reference = {
                "street": state.street_index,
                "bet": self.opening if preflop else 0,
                "full": self.opening if preflop else self.big_blind,
                "acted": {},
            }

    def tda_closes_raise(self, player):
        acted = self.reference["acted"]
        return player in acted and self.reference["bet"] - acted[player] < self.reference["full"]

    def note_action(self, player, kind, to=None):
        reference = self.reference
        if kind == "raise":
            if to - reference["bet"] >= reference["full"]:
                reference["full"] = to - reference["bet"]
            reference["bet"] = max(reference["bet"], to)
            reference["acted"][player] = reference["bet"]
        elif kind == "call":
            reference["acted"][player] = reference["bet"]

    def pokerkit_raise(self):
        state = self.state
        try:
            state.verify_completion_betting_or_raising_to()
        except ValueError as error:
            return None, str(error)
        return (
            state.min_completion_betting_or_raising_to_amount,
            state.max_completion_betting_or_raising_to_amount,
        ), None

    def act(self, step):
        state = self.state
        pending = step["pending"]
        command = step["command"]
        self.skip_dead_checks(pending["seat"] if pending["kind"] == "Bet" else None)
        actor = state.actor_index
        actor_seat = None if actor is None else self.order[actor]
        if pending["kind"] != "Bet":
            if step["accepted"]:
                self.differ("act-without-betting", f"engine accepted {command} with nothing to bet")
            elif actor_seat is not None:
                self.differ("turn", f"engine has no betting round, pokerkit waits for seat {actor_seat}")
            return
        short_big_blind = self.short_big_blind and self.engine_preflop
        rule_seven = short_big_blind and self.others_can_act(pending["seat"])
        if actor_seat != pending["seat"]:
            if rule_seven:
                self.excluded.add("short-big-blind")
                self.stop("short-big-blind")
                return
            if short_big_blind:
                self.differ(
                    "dead-decision-after-short-big-blind",
                    f"engine asks seat {pending['seat']} to call {pending['call']} that no live seat can match; "
                    f"pokerkit asks seat {actor_seat} because every chip beyond the short big blind comes back",
                )
                self.stop("dead-decision-after-short-big-blind")
                return
            self.differ("turn", f"engine seat {pending['seat']} to act, pokerkit seat {actor_seat}")
            self.stop("turn")
            return
        self.reset_reference()
        call = state.checking_or_calling_amount
        bounds, refusal = self.pokerkit_raise()
        engine_raise = pending["raise"]
        engine_bounds = None if engine_raise is None else (engine_raise["minTo"], engine_raise["maxTo"])
        engine_call = 0 if pending["canCheck"] else pending["call"]
        if rule_seven and (engine_call != call or engine_bounds != bounds):
            self.excluded.add("short-big-blind")
            self.stop("short-big-blind")
            return
        if engine_call != call:
            self.differ("call", f"seat {actor_seat}: engine owes {engine_call}, pokerkit {call}")
        raise_excluded = None
        if (engine_bounds is None) != (bounds is None):
            if engine_bounds is None and self.tda_closes_raise(actor):
                raise_excluded = "pokerkit-short-all-in-reopens"
            elif bounds is None and refusal.startswith(NOBODY_CAN_CALL):
                raise_excluded = "pokerkit-refuses-raise-nobody-can-call"
            elif bounds is None and refusal.startswith(ALREADY_ACTED) and not self.tda_closes_raise(actor):
                raise_excluded = "pokerkit-forgets-added-short-all-ins"
            else:
                self.differ(
                    "raise-availability",
                    f"seat {actor_seat} street {state.street_index}: engine raise {engine_bounds}, pokerkit {bounds} ({refusal})",
                )
            if raise_excluded is not None:
                self.excluded.add(raise_excluded)
        elif engine_bounds is not None and engine_bounds != bounds:
            self.differ("raise-size", f"seat {actor_seat} street {state.street_index}: engine {engine_bounds}, pokerkit {bounds}")
        if step["accepted"]:
            self.apply_action(step, actor, actor_seat, call, raise_excluded)
            if any(e["_tag"] in ("StreetDealt", "HandEnded") for e in step["events"]):
                self.engine_preflop = False
        else:
            self.check_rejection(step, actor, actor_seat, call, raise_excluded)

    def note_engine_events(self, events):
        for event in events:
            if event["_tag"] == "Folded":
                self.engine_folded.add(event["seat"])
            elif event.get("allIn"):
                self.engine_all_in.add(event["seat"])

    def others_can_act(self, seat):
        return any(s != seat and s not in self.engine_folded and s not in self.engine_all_in for s in self.order)

    def skip_dead_checks(self, expected):
        state = self.state
        while self.stopped is None and state.actor_index is not None and self.order[state.actor_index] != expected:
            if state.checking_or_calling_amount != 0:
                return
            bounds, refusal = self.pokerkit_raise()
            if bounds is not None or not refusal.startswith(NOBODY_CAN_CALL):
                return
            state.check_or_call()
            self.configured.add("pokerkit-dead-check")
            self.advance()

    def apply_action(self, step, actor, actor_seat, call, raise_excluded):
        state = self.state
        action = step["command"]["action"]
        tag = action["_tag"]
        if step["command"]["seat"] != actor_seat:
            self.differ("turn", f"engine accepted {tag} from seat {step['command']['seat']}, pokerkit actor {actor_seat}")
            self.stop("turn")
            return
        try:
            if tag == "Fold":
                state.fold()
            elif tag == "Check":
                if call != 0:
                    self.differ("check", f"engine let seat {actor_seat} check facing {call}")
                    self.stop("check")
                    return
                state.check_or_call()
                self.note_action(actor, "call")
            elif tag == "Call":
                called = next(e["amount"] for e in step["events"] if e["_tag"] == "Called")
                if called != call:
                    self.differ("call-amount", f"seat {actor_seat}: engine called {called}, pokerkit {call}")
                if state.stacks[actor] < max(state.bets) - state.bets[actor]:
                    self.features.add("short-all-in")
                state.check_or_call()
                self.note_action(actor, "call")
            else:
                to = action["to"]
                if state.can_complete_bet_or_raise_to(to):
                    state.complete_bet_or_raise_to(to)
                    self.note_action(actor, "raise", to)
                elif raise_excluded == "pokerkit-forgets-added-short-all-ins":
                    self.stop("pokerkit-forgets-added-short-all-ins")
                elif raise_excluded == "pokerkit-refuses-raise-nobody-can-call":
                    state.check_or_call()
                    self.note_action(actor, "call")
                    if state.street_index == 3:
                        self.river_call_for_raise = True
                else:
                    self.differ("raise-accepted", f"engine accepted raise to {to} by seat {actor_seat}; pokerkit refuses")
                    self.stop("raise-accepted")
        except ValueError as error:
            self.differ("pokerkit-refused", f"{tag} by seat {actor_seat}: {error}")
            self.stop("pokerkit-refused")

    def check_rejection(self, step, actor, actor_seat, call, raise_excluded):
        state = self.state
        command = step["command"]
        tag = command["action"]["_tag"]
        rejection = step["rejection"]["tag"]
        if rejection == "NotYourTurn":
            if command["seat"] == actor_seat:
                self.differ("rejected-legal", f"engine says not seat {command['seat']}'s turn, pokerkit agrees it is")
            return
        if rejection != "IllegalAction":
            self.differ("rejection", f"unexpected rejection {rejection} for {command}")
            return
        if tag == "Check" and call == 0:
            self.differ("rejected-legal", f"engine refused a check by seat {actor_seat}, pokerkit owes nothing")
        elif tag == "Call" and call != 0:
            self.differ("rejected-legal", f"engine refused a call of {call} by seat {actor_seat}")
        elif tag == "Fold":
            self.differ("rejected-legal", f"engine refused a fold by seat {actor_seat}")
        elif tag == "RaiseTo" and state.can_complete_bet_or_raise_to(command["action"]["to"]):
            if raise_excluded != "pokerkit-short-all-in-reopens":
                self.differ("rejected-legal", f"engine refused a raise to {command['action']['to']} by seat {actor_seat}, pokerkit allows it")

    def check_fixed_cap(self):
        self.replay_checked.add("run-cap")
        missing = 5 - sum(len(cards) for cards in self.board_deals)
        remaining = 52 - self.pointer
        cap = 1
        while cap < self.max_runs and (cap + 1) * missing <= remaining:
            cap += 1
        if self.fixed_runs != cap:
            self.differ("run-cap", f"engine ran a fixed {self.fixed_runs} runs, replay cap {cap}")

    def choose(self, step):
        state = self.state
        self.skip_dead_checks(None)
        pending = step["pending"]
        command = step["command"]
        live = set(self.order[i] for i in state.runout_count_selector_indices)
        if pending["kind"] == "ChooseRuns":
            if self.selectors is None:
                self.differ("run-choice", f"engine asks {pending['seats']} for runs, pokerkit asks nobody")
                self.stop("run-choice")
                return
            if not self.choices and set(pending["seats"]) != self.selectors:
                self.differ("run-choice", f"engine asks {sorted(pending['seats'])}, pokerkit {sorted(self.selectors)}")
            self.replay_checked.add("run-cap")
            missing = 5 - sum(len(cards) for cards in self.board_deals)
            remaining = 52 - self.pointer
            cap = 1
            while cap < self.max_runs and (cap + 1) * missing <= remaining:
                cap += 1
            if pending["maxRuns"] != cap:
                self.differ("run-cap", f"engine caps runs at {pending['maxRuns']}, replay {cap}")
        owed = command["seat"] in live and command["seat"] not in self.choices
        if step["accepted"]:
            if not owed:
                self.differ("run-choice", f"engine accepted a choice from seat {command['seat']}, pokerkit owes none")
            self.choices[command["seat"]] = command["runs"]
            agreed = [e["runs"] for e in step["events"] if e["_tag"] == "RunsAgreed"]
            if agreed:
                self.agreed = min(self.choices.values())
                if len(set(self.choices.values())) > 1:
                    self.configured.add("runs-agreed-smallest")
                if agreed[0] != self.agreed:
                    self.differ("runs-agreed", f"engine runs {agreed[0]}, smallest choice {self.agreed}")
                if set(self.choices) != self.selectors:
                    if self.agreed == 1 and set(self.choices) < self.selectors:
                        self.configured.add("one-run-ends-choice")
                    else:
                        self.differ("run-choice", f"choices from {sorted(self.choices)}, pokerkit selectors {sorted(self.selectors)}")
        else:
            rejection = step["rejection"]["tag"]
            if rejection == "NoRunChoiceOwed" and owed:
                self.differ("run-choice", f"engine refused a choice pokerkit owes from seat {command['seat']}")
            elif rejection == "RunsOutOfRange" and not owed:
                self.differ("run-choice", f"engine said out of range for a seat that owes nothing")

    def check_showdown_order(self):
        if self.order_checked:
            return self.stopped is None
        self.order_checked = True
        self.configured.add("interactive-show-or-muck")
        pokerkit_order = [self.order[i] for i in self.state.showdown_indices]
        if pokerkit_order == self.interactive:
            return True
        if self.river_call_for_raise:
            self.excluded.add("pokerkit-refuses-raise-nobody-can-call")
            self.stop("pokerkit-refuses-raise-nobody-can-call")
        elif self.config.get("showdownOrder") == "LastAggressor":
            self.excluded.add("showdown-order-last-aggressor")
            self.stop("showdown-order-last-aggressor")
        else:
            self.differ("show-or-muck", f"engine showdown order {self.interactive}, pokerkit {pokerkit_order}")
            self.stop("show-or-muck")
        return False

    def live_pots(self):
        return [tuple(pot.player_indices) for pot in self.state.pots]

    def show_unasked(self, player):
        seat = self.order[player]
        shared = [[self.order[i] for i in pot] for pot in self.live_pots() if player in pot and len(pot) > 1]
        if shared:
            self.differ("showdown-turn", f"engine never asks seat {seat}, pokerkit has it in contested pots {shared}")
        self.configured.add("uncontested-winner-unshown")
        self.state.show_or_muck_hole_cards(True, player)
        self.showdown.append((seat, True, False))

    def shown_hand(self, player):
        statuses = self.state.hole_card_statuses[player]
        return self.state.get_hand(player, 0, 0) if statuses and all(statuses) else None

    def must_table(self, player):
        own = self.state.get_hand(player, 0, 0)
        for pot in self.live_pots():
            if player not in pot or len(pot) < 2:
                continue
            shown = [hand for hand in (self.shown_hand(i) for i in pot if i != player) if hand is not None]
            if shown and all(hand <= own for hand in shown):
                return True
        return False

    def keeps_uncontested(self, player):
        return any(pot == (player,) for pot in self.live_pots())

    def choose_at_showdown(self, step):
        if self.hidden_run_out:
            self.excluded.add("all-in-hands-hidden")
            return
        state = self.state
        self.skip_dead_checks(None)
        pending = step["pending"]
        command = step["command"]
        player = state.showdown_index
        pokerkit_seat = None if player is None else self.order[player]
        rejection = None if step["accepted"] else step["rejection"]["tag"]
        if pending["kind"] != "Show":
            if step["accepted"]:
                self.differ("showdown-turn", f"engine accepted {command} with no showdown turn")
            elif pokerkit_seat is not None and pokerkit_seat == command["seat"] and self.interactive is not None:
                self.differ("showdown-turn", f"engine refused seat {command['seat']}, pokerkit waits for it")
            return
        if not self.check_showdown_order():
            return
        if pending["seat"] != pokerkit_seat:
            self.differ("showdown-turn", f"engine asks seat {pending['seat']}, pokerkit {pokerkit_seat}")
            self.stop("showdown-turn")
            return
        must = self.must_table(player)
        self.replay_checked.add("showdown-must-table")
        if pending["canMuck"] == must or not pending["canTable"]:
            self.differ(
                "showdown-must-table",
                f"seat {pending['seat']}: engine may muck {pending['canMuck']}, replay must table {must}",
            )
        can_win = state.can_win_now(player)
        if pending["beatenInEveryPot"] == can_win:
            self.differ(
                "showdown-beaten",
                f"seat {pending['seat']}: engine beaten in every pot {pending['beatenInEveryPot']}, pokerkit can_win_now {can_win}",
            )
        if command["seat"] != pending["seat"]:
            if rejection != "NoShowdownChoiceOwed":
                self.differ("showdown-turn", f"engine answered {command} with {rejection} while seat {pending['seat']} was asked")
            return
        mucks = command["_tag"] == "MuckHand"
        if rejection is not None:
            if not (mucks and rejection == "WinningHandMustTable" and must):
                self.differ("showdown-must-table", f"engine refused {command} with {rejection}, replay must table {must}")
            return
        if mucks and must:
            self.differ("showdown-must-table", f"engine let seat {command['seat']} muck a hand that beats or ties the tabled hands")
        if mucks and self.keeps_uncontested(player):
            self.excluded.add("muck-keeps-uncontested-pot")
            self.stop("muck-keeps-uncontested-pot")
            return
        state.show_or_muck_hole_cards(not mucks, player)
        self.showdown.append((command["seat"], not mucks, False))

    def finish(self):
        state = self.state
        self.skip_dead_checks(None)
        if state.status:
            self.differ("unfinished", f"pokerkit still waiting: actor {state.actor_index}, selectors {list(state.runout_count_selector_indices)}")
            return
        self.check_board()
        self.check_showdown()
        if self.stopped is not None:
            return
        self.check_payout()

    def check_board(self):
        engine = [e["cards"] for e in self.events() if e["_tag"] == "StreetDealt"]
        if engine != self.board_deals:
            self.differ("board", f"engine dealt {engine}, pokerkit dealt {self.board_deals}")

    def check_showdown(self):
        if self.hidden_run_out:
            self.excluded.add("all-in-hands-hidden")
            return
        events = list(self.events())
        tabled = [e for e in events if e["_tag"] == "HandsTabled"]
        showdowns = [e for e in events if e["_tag"] == "ShowdownReached"]
        pokerkit_tabled = sorted(seat for seat, shows, tabling in self.showdown if tabling)
        if tabled:
            engine_tabled = sorted(hand["seat"] for hand in tabled[0]["hands"])
            if engine_tabled != pokerkit_tabled:
                self.differ("tabling", f"engine tabled {engine_tabled}, pokerkit {pokerkit_tabled}")
            return
        if pokerkit_tabled:
            self.differ("tabling", f"pokerkit tabled {pokerkit_tabled}, engine tabled nothing")
        if self.interactive is not None:
            engine_order = [(seat, self.engine_choices.get(seat, True)) for seat in self.interactive]
            pokerkit_order = [(seat, shows) for seat, shows, _ in self.showdown]
            if engine_order != pokerkit_order:
                self.differ("show-or-muck", f"engine {engine_order}, pokerkit {pokerkit_order}")
            return
        if not showdowns:
            if self.showdown:
                self.differ("showdown", f"pokerkit showed down {self.showdown}, engine folded out")
            return
        engine_order = [(entry["seat"], entry["_tag"] == "Shown") for entry in showdowns[0]["order"]]
        pokerkit_order = [(seat, shows) for seat, shows, _ in self.showdown]
        if engine_order != pokerkit_order:
            if self.river_call_for_raise:
                self.excluded.add("pokerkit-refuses-raise-nobody-can-call")
            elif self.config.get("showdownOrder") == "LastAggressor" and [s for s, _ in engine_order] != [
                s for s, _ in pokerkit_order
            ]:
                self.excluded.add("showdown-order-last-aggressor")
            else:
                self.differ("show-or-muck", f"engine {engine_order}, pokerkit {pokerkit_order}")

    def check_payout(self):
        events = list(self.events())
        if self.hidden_run_out and any(e["_tag"] == "HandMucked" for e in events):
            self.excluded.add("all-in-hands-hidden")
            return
        awards = [e for e in events if e["_tag"] == "PotAwarded"]
        final = self.record["final"]
        engine_final = [final[seat]["stack"] for seat in self.order]
        pokerkit_final = list(self.state.stacks)
        showdown = any(e["_tag"] in ("ShowdownReached", "ShowdownStarted") for e in events)
        if not showdown:
            if engine_final != pokerkit_final:
                self.differ("final-stacks", f"fold-out: engine {self.stacks_text(engine_final)}, pokerkit {self.stacks_text(pokerkit_final)}")
            return
        engine_pots = {}
        for award in awards:
            pot = engine_pots.setdefault(award["pot"], {"amount": 0, "eligible": tuple(sorted(award["eligible"])), "runs": {}})
            pot["amount"] += award["amount"]
            pot["runs"][award["run"]] = {w["seat"]: w["amount"] for w in award["winners"]}
        pokerkit_pots = [(amount, tuple(sorted(eligible))) for amount, eligible in self.pots]
        engine_list = [(engine_pots[p]["amount"], engine_pots[p]["eligible"]) for p in sorted(engine_pots)]
        if engine_list != pokerkit_pots:
            self.differ("pots", f"engine {engine_list}, pokerkit {pokerkit_pots}")
            return
        boards = self.state.board_count
        runs = [e["runs"] for e in events if e["_tag"] == "RunsAgreed"]
        if boards != (runs[0] if runs else 1):
            self.differ("runs", f"pokerkit ran {boards} boards, engine {runs}")
            return
        expected_gain = Counter()
        pokerkit_gain = Counter()
        for operation in self.pushes:
            for i, amount in enumerate(operation.amounts):
                pokerkit_gain[self.order[i]] += amount
        recipients_ok = True
        for p, (amount, eligible) in enumerate(pokerkit_pots):
            parts = [amount // boards + (1 if r < amount % boards else 0) for r in range(boards)]
            for r in range(boards):
                winners = self.winners(eligible, r)
                share, extra = divmod(parts[r], len(winners))
                expected = {seat: share + (1 if place < extra else 0) for place, seat in enumerate(winners)}
                for seat, given in expected.items():
                    expected_gain[seat] += given
                engine_part = engine_pots[p + 1]["runs"].get(r + 1, {})
                if engine_part != expected:
                    self.differ("award", f"pot {p + 1} run {r + 1}: engine {engine_part}, brief split of pokerkit winners {expected}")
        for operation in self.pushes:
            boards_paid = range(boards) if operation.board_index is None else [operation.board_index]
            allowed = {seat for r in boards_paid for _, eligible in pokerkit_pots for seat in self.winners(eligible, r)}
            if any(given > 0 and self.order[i] not in allowed for i, given in enumerate(operation.amounts)):
                recipients_ok = False
        if +expected_gain != +pokerkit_gain:
            bound = sum(boards + len(eligible) for _, eligible in pokerkit_pots)
            close = all(abs(expected_gain[seat] - pokerkit_gain[seat]) <= bound for seat in self.order)
            if recipients_ok and close and sum(expected_gain.values()) == sum(pokerkit_gain.values()):
                self.excluded.add("odd-chip-spread")
            else:
                self.differ("pokerkit-payout", f"pokerkit paid {dict(pokerkit_gain)}, its winners under the brief split {dict(expected_gain)}")
        adjusted = [pokerkit_final[i] + expected_gain[seat] - pokerkit_gain[seat] for i, seat in enumerate(self.order)]
        if engine_final != adjusted:
            self.differ("final-stacks", f"engine {self.stacks_text(engine_final)}, pokerkit {self.stacks_text(adjusted)}")

    def winners(self, eligible, board):
        key = (tuple(eligible), board)
        if key not in self.winner_cache:
            self.winner_cache[key] = self.best_hands(eligible, board)
        return self.winner_cache[key]

    def best_hands(self, eligible, board):
        mucked = {seat for seat, shows, _ in self.showdown if not shows}
        eligible = [seat for seat in eligible if seat not in mucked]
        cards = list(self.state.get_board_cards(board))
        hands = {
            seat: StandardHighHand.from_game(tuple(CARDS[c] for c in self.hole[self.index[seat]]), cards)
            for seat in eligible
        }
        best = max(hands.values())
        return [seat for seat in sorted(eligible, key=lambda s: self.index[s]) if hands[seat] == best]

    def stacks_text(self, stacks):
        return {seat: stacks[i] for i, seat in enumerate(self.order)}

    def check_after_hand(self):
        events = list(self.events())
        public = defaultdict(set)
        for event in events:
            if event["_tag"] == "HandsTabled":
                for hand in event["hands"]:
                    public[hand["seat"]].update(hand["cards"])
            elif event["_tag"] == "ShowdownReached":
                for entry in event["order"]:
                    if entry["_tag"] == "Shown":
                        public[entry["seat"]].update(entry["cards"])
            elif event["_tag"] == "HandTabled":
                public[event["seat"]].update(event["cards"])
        board = sum(len(e["cards"]) for e in events if e["_tag"] == "StreetDealt" and e["run"] == 1)
        ran_out = any(e["_tag"] == "RunsAgreed" for e in events) or any(e["_tag"] == "HandsTabled" for e in events)
        undealt = [] if ran_out else self.deck[2 * self.count + board : 2 * self.count + 5]
        hunted = False
        folded = {e["seat"] for e in events if e["_tag"] == "Folded"}
        for step in self.record["after"]:
            command = step["command"]
            seat = command["seat"]
            rules = step["config"]
            rejection = None if step["accepted"] else step["rejection"]["tag"]
            if command["_tag"] == "RabbitHunt":
                self.replay_checked.add("rabbit-hunt")
                if (rejection == "RabbitHuntOff") != (not rules["rabbitHunt"]):
                    self.differ("rabbit-hunt", f"rabbit hunting {'on' if rules['rabbitHunt'] else 'off'}, engine answered {rejection}")
                    continue
                if rejection in ("RabbitHuntOff", "NotInLastHand"):
                    continue
                if rules.get("rabbitHunters") == "StillIn" and seat in folded:
                    if rejection != "FoldedSeatCannotHunt":
                        self.differ("rabbit-hunt", f"seat {seat} folded, engine answered {rejection}, replay expects FoldedSeatCannotHunt")
                    continue
                if rejection == "FoldedSeatCannotHunt":
                    self.differ("rabbit-hunt", f"engine refused seat {seat} as folded, replay finds it still in or the rule off")
                    continue
                if step["accepted"]:
                    cards = step["events"][0]["cards"]
                    if hunted or not undealt or cards != undealt:
                        self.differ("rabbit-hunt", f"engine revealed {cards}, undealt {undealt}, hunted before {hunted}")
                    hunted = True
                elif rejection == "NothingToHunt" and undealt:
                    self.differ("rabbit-hunt", f"engine found nothing to hunt, replay expects {undealt}")
                elif rejection == "RabbitAlreadyHunted" and not hunted:
                    self.differ("rabbit-hunt", "engine says already hunted on the first hunt")
                continue
            self.replay_checked.add("voluntary-show")
            if rejection == "NotInLastHand":
                if seat in self.index:
                    self.features.add("show-after-reseat")
                continue
            held = set(self.hole[self.index[seat]]) if seat in self.index else set()
            cards = set(command["cards"])
            both = rules.get("voluntaryShows") != "BothCards" or held <= cards | public[seat]
            legal = seat in self.index and cards <= held and not (cards & public[seat]) and both
            if step["accepted"] != legal:
                self.differ("voluntary-show", f"seat {seat} shows {sorted(cards)}: engine {step['accepted']} ({rejection}), replay {legal}")
            if step["accepted"]:
                public[seat].update(cards)


def next_after(seats, seat):
    return next((s for s in seats if s > seat), seats[0])


def straddle_amount(config, position):
    doublings = 1 if config.get("straddleSize") == "TwoBigBlinds" else position + 1
    return config["bigBlind"] * 2**doublings


def straddle_problem(config, seats, dealt, button, straddles):
    if not straddles:
        return None
    if len(dealt) == 2:
        return "heads-up"
    rules = config["straddle"]
    small = next_after(dealt, button)
    big = next_after(dealt, small)
    after = [s for s in dealt if s > big] + [s for s in dealt if s <= big]
    line = after[: after.index(button) + 1]
    under_the_gun = len(straddles) <= rules["underTheGun"] and list(straddles) == line[: len(straddles)]
    button_alone = list(straddles) == [button] and rules["button"]
    if not under_the_gun and not button_alone:
        return "out of rule 8"
    ante = config["ante"]
    for position, seat in enumerate(straddles):
        stack = seats[seat]["stack"]
        posted = min(ante["amount"], stack) if ante["_tag"] == "EveryPlayer" else 0
        if stack - posted <= straddle_amount(config, position):
            return "cannot cover"
    return None


def replay(line):
    record = json.loads(line)
    unknown = unknown_settings(record)
    if unknown:
        detail = f"replay.py does not know {', '.join(unknown)}: teach it the setting, or name an exclusion if PokerKit cannot follow it"
        return {
            "hand": record["hand"],
            "seats": len(record["start"][0]["dealtIn"]),
            "steps": len(record["steps"]),
            "features": [],
            "configured": [],
            "excluded": [],
            "replayChecked": [],
            "stopped": "unknown-setting",
            "differences": [("unknown-setting", detail)],
            "compared": False,
        }
    hand = Hand(record)
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        try:
            hand.run()
        except AssertionError as error:
            if hand.pots is None and hand.state is not None and sum(hand.state.statuses) == 1:
                hand.differ("unmatched-folded-chips", "pokerkit cannot pay a fold-out pot no live seat can win")
                hand.stop("unmatched-folded-chips")
            else:
                hand.differ("replay-crash", f"{type(error).__name__}: {error} {traceback.format_exc(limit=-3)}")
        except Exception as error:
            hand.differ("replay-crash", f"{type(error).__name__}: {error} {traceback.format_exc(limit=-3)}")
    for caught_warning in caught:
        message = str(caught_warning.message)
        if message in BENIGN_WARNINGS:
            continue
        hand.differ("pokerkit-warning", message)
    return {
        "hand": record["hand"],
        "seats": len(hand.order) if hasattr(hand, "order") else 0,
        "steps": len(record["steps"]),
        "features": sorted(hand.features),
        "configured": sorted(hand.configured),
        "excluded": sorted(hand.excluded),
        "replayChecked": sorted(hand.replay_checked),
        "stopped": hand.stopped,
        "differences": hand.differences,
        "compared": hand.state is not None,
    }


def replay_chunk(lines):
    return [replay(line) for line in lines]


def read_records(path):
    if path.endswith(".json"):
        with open(path) as handle:
            return [json.dumps(json.load(handle))]
    with open(path) as handle:
        return [line for line in handle if line.strip()]


def summarize(results, path, report):
    features = defaultdict(Counter)
    configured = Counter()
    excluded = Counter()
    replay_checked = Counter()
    differences = defaultdict(list)
    for result in results:
        if not result["compared"]:
            outcome = "not compared"
        elif result["differences"]:
            outcome = "differ"
        elif result["excluded"]:
            outcome = "excluded"
        else:
            outcome = "full"
        for feature in result["features"] + ["all-hands"]:
            features[feature][outcome] += 1
        configured.update(result["configured"])
        excluded.update(result["excluded"])
        replay_checked.update(result["replayChecked"])
        for category, detail in result["differences"]:
            differences[category].append((result["hand"], result["seats"], result["steps"], detail))
    lines = [
        f"differential: {len(results)} hands from {path}",
        f"oracle: pokerkit {POKERKIT_VERSION} on python {sys.version.split()[0]}",
        "",
        "per feature, hands compared in full, compared with a named exclusion, not compared at all,",
        "and hands with an unexplained difference:",
        f"{'feature':<22}{'full':>9}{'excluded':>10}{'not compared':>14}{'differ':>8}",
    ]
    order = (
        ["all-hands"]
        + [f"seats-{n}" for n in range(2, 10)]
        + ["heads-up", "ante-none", "ante-every-player", "ante-big-blind"]
        + ["straddle-none", "straddle-single", "straddle-double", "straddle-button"]
        + [f"runs-{n}" for n in range(1, 5)]
        + ["short-all-in", "short-big-blind", "side-pots", "split-pots", "odd-chips"]
        + ["fold-out", "showdown", "mucks", "rejected-commands", "rabbit-hunt", "voluntary-show"]
        + ["interactive-showdown", "concession", "unshown-winner", "hidden-run-out", "casino-blinds"]
    )
    for feature in order + sorted(set(features) - set(order)):
        counts = features.get(feature, Counter())
        lines.append(
            f"{feature:<22}{counts['full']:>9}{counts['excluded']:>10}{counts['not compared']:>14}{counts['differ']:>8}"
        )
    lines += ["", "configured to match the brief (hands):"]
    for name, reason in CONFIGURATIONS.items():
        lines.append(f"  {name:<40}{configured[name]:>8}  {reason}")
    lines += ["", "named exclusions (hands):"]
    for name, reason in EXCLUSIONS.items():
        lines.append(f"  {name:<40}{excluded[name]:>8}  {reason}")
    lines += ["", "gaps: pokerkit cannot check these at all; the replay checks them with its own arithmetic (hands):"]
    for name, reason in REPLAY_ONLY.items():
        lines.append(f"  {name:<40}{replay_checked[name]:>8}  {reason}")
    total = sum(len(found) for found in differences.values())
    lines += ["", f"unexplained differences: {total} in {sum(1 for r in results if r['differences'])} hands"]
    for category, found in sorted(differences.items(), key=lambda item: -len(item[1])):
        smallest = sorted(found, key=lambda f: (f[1], f[2], f[0]))[:3]
        lines.append(f"  {category}: {len(found)}")
        for hand, seats, steps, detail in smallest:
            lines.append(f"    hand {hand} ({seats} seats, {steps} steps): {detail[:400]}")
    print("\n".join(lines))
    if report:
        with open(report, "w") as handle:
            json.dump({"differences": {k: v for k, v in differences.items()}, "results": results}, handle)
    return total


def categories(record):
    return {category for category, _ in replay(json.dumps(record))["differences"]}


def trimmed(record, category):
    candidates = [
        lambda r: {**r, "after": [], "rejectedStarts": []},
        lambda r: {**r, "steps": [step for step in r["steps"] if step["accepted"]]},
        lambda r: {
            **r,
            "seats": [seat if i in r["start"][0]["dealtIn"] else None for i, seat in enumerate(r["seats"])],
            "final": [seat if i in r["start"][0]["dealtIn"] else None for i, seat in enumerate(r["final"])],
        },
    ]
    for candidate in candidates:
        smaller = candidate(record)
        if category in categories(smaller):
            record = smaller
    return record


def write_findings(lines, results, directory):
    smallest = {}
    for line, result in zip(lines, results):
        for category, detail in result["differences"]:
            size = (result["seats"], result["steps"], result["hand"])
            if category not in smallest or size < smallest[category][0]:
                smallest[category] = (size, line, detail)
    os.makedirs(directory, exist_ok=True)
    for category, (_, line, detail) in sorted(smallest.items()):
        record = trimmed(json.loads(line), category)
        path = os.path.join(directory, f"{category}.json")
        with open(path, "w") as handle:
            json.dump(record, handle, indent=1)
            handle.write("\n")
        print(f"wrote {path}: hand {record['hand']}, {detail[:200]}")


def main(arguments):
    path = arguments[0]
    report = None
    workers = os.cpu_count() or 1
    if "--report" in arguments:
        report = arguments[arguments.index("--report") + 1]
    if "--workers" in arguments:
        workers = int(arguments[arguments.index("--workers") + 1])
    lines = read_records(path)
    size = max(1, len(lines) // (workers * 8))
    chunks = [lines[i : i + size] for i in range(0, len(lines), size)]
    if workers == 1:
        results = [result for chunk in chunks for result in replay_chunk(chunk)]
    else:
        with ProcessPoolExecutor(max_workers=workers) as pool:
            results = [result for chunk in pool.map(replay_chunk, chunks) for result in chunk]
    total = summarize(results, path, report)
    if "--findings" in arguments:
        write_findings(lines, results, arguments[arguments.index("--findings") + 1])
    return 1 if total else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
