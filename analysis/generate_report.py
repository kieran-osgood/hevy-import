#!/usr/bin/env python3
"""Generate progress charts from a Hevy workout export.

Usage:
    python analysis/generate_report.py path/to/Workout_Data.csv

Writes PNG charts into analysis/charts/. Estimated 1RM uses the Epley
formula: weight * (1 + reps / 30).
"""
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import matplotlib

matplotlib.use("Agg")
import matplotlib.dates as mdates  # noqa: E402
import matplotlib.patches as mpatches  # noqa: E402
import matplotlib.pyplot as plt  # noqa: E402

plt.rcParams.update(
    {
        "figure.dpi": 130,
        "font.size": 11,
        "axes.grid": True,
        "grid.alpha": 0.25,
        "axes.spines.top": False,
        "axes.spines.right": False,
    }
)

OUT = Path(__file__).parent / "charts"
OUT.mkdir(parents=True, exist_ok=True)
COL = {
    "Deadlift (Barbell)": "#d6336c",
    "Bench Press (Barbell)": "#1c7ed6",
    "Squat (Barbell)": "#2f9e44",
}


def load(csv_path: str) -> pd.DataFrame:
    df = pd.read_csv(csv_path)
    df["dt"] = pd.to_datetime(df["start_time"], format="%d %b %Y, %H:%M")
    work = df[
        df["set_type"].isin(["normal", "failure", "dropset"])
        & df["weight_kg"].notna()
        & df["reps"].notna()
        & (df["reps"] > 0)
        & (df["weight_kg"] > 0)
    ].copy()
    work["e1rm"] = work["weight_kg"] * (1 + work["reps"] / 30.0)
    return work


def best_per_session(work: pd.DataFrame, name: str) -> pd.DataFrame:
    s = work[work["exercise_title"] == name]
    g = (
        s.groupby(s["dt"].dt.normalize())["e1rm"]
        .max()
        .reset_index()
        .sort_values("dt")
    )
    return g


def chart_big3(work):
    fig, ax = plt.subplots(figsize=(11, 6))
    for name, lab in [
        ("Deadlift (Barbell)", "Deadlift"),
        ("Bench Press (Barbell)", "Bench"),
        ("Squat (Barbell)", "Back Squat"),
    ]:
        g = best_per_session(work, name)
        ax.plot(g["dt"], g["e1rm"], "o-", ms=4, lw=1.6, color=COL[name], label=lab, alpha=0.85)
        ax.plot(g["dt"], g["e1rm"].cummax(), "-", lw=2.6, color=COL[name], alpha=0.95)
    ax.set_title("Estimated 1RM Progression — The Big 3", fontweight="bold")
    ax.set_ylabel("Estimated 1RM (kg, Epley)")
    ax.legend(loc="lower right", frameon=False)
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%b %y"))
    fig.tight_layout()
    fig.savefig(OUT / "01_big3_progression.png")
    plt.close()


def chart_vs_projected():
    lifts = ["Squat", "Bench", "Deadlift"]
    start = {"Squat": 136.5, "Bench": 86.7, "Deadlift": 176.0}
    projected = {"Squat": 167.5, "Bench": 110.0, "Deadlift": 190.0}
    achieved = {"Squat": 165.0, "Bench": 115.0, "Deadlift": 190.0}
    fig, ax = plt.subplots(figsize=(10, 6))
    x = np.arange(len(lifts))
    w = 0.25
    for off, data, lab, c in [
        (-w, start, "Start (baseline)", "#adb5bd"),
        (0, projected, "Program target", "#ffd43b"),
        (w, achieved, "Achieved (best lift)", "#37b24d"),
    ]:
        bars = ax.bar(x + off, [data[l] for l in lifts], w, label=lab, color=c)
        for b in bars:
            ax.text(b.get_x() + b.get_width() / 2, b.get_height() + 1.5,
                    f"{b.get_height():.0f}", ha="center", fontsize=9)
    ax.set_xticks(x)
    ax.set_xticklabels(lifts)
    ax.set_ylabel("kg")
    ax.set_title("Achieved vs Projected 1RM — 16-Week Program Targets", fontweight="bold")
    ax.legend(frameon=False)
    fig.tight_layout()
    fig.savefig(OUT / "02_achieved_vs_projected.png")
    plt.close()


def chart_movers(work):
    rows = []
    for name, s in work.groupby("exercise_title"):
        bps = s.groupby(s["dt"].dt.date)["e1rm"].max()
        if bps.index.size < 5:
            continue
        early, late = bps.iloc[:3].mean(), bps.iloc[-3:].mean()
        rows.append((name, late - early, (late - early) / early * 100))
    res = pd.DataFrame(rows, columns=["ex", "abs", "pct"]).sort_values("abs", ascending=False).head(12)
    res = res.sort_values("abs")
    mains = ("Deadlift", "Bench", "Squat", "Romanian", "Row (Barbell)")
    colors = ["#d6336c" if any(m in e for m in mains) else "#4263eb" for e in res["ex"]]
    fig, ax = plt.subplots(figsize=(11, 7))
    ax.barh(res["ex"], res["abs"], color=colors)
    for y, (a, p) in enumerate(zip(res["abs"], res["pct"])):
        ax.text(a + 1.5, y, f"+{a:.0f}kg ({p:.0f}%)", va="center", fontsize=8.5)
    ax.set_xlabel("Estimated 1RM gain (kg)")
    ax.set_title("Biggest Movers — e1RM Gain (first 3 vs last 3 sessions)", fontweight="bold")
    ax.set_xlim(0, res["abs"].max() * 1.25)
    ax.legend(
        handles=[
            mpatches.Patch(color="#d6336c", label="Main barbell lifts"),
            mpatches.Patch(color="#4263eb", label="Accessories/machines"),
        ],
        frameon=False,
        loc="lower right",
    )
    fig.tight_layout()
    fig.savefig(OUT / "03_biggest_movers.png")
    plt.close()


def chart_squat(work):
    fam = {
        "Squat (Barbell)": "Back Squat",
        "Front Squat": "Front Squat",
        "Zercher Squat": "Zercher Squat",
        "Pause Squat (2 sec)": "Pause Squat",
        "Bulgarian Split Squat": "Bulgarian Split Squat",
        "Hack Squat": "Hack Squat",
    }
    fig, ax = plt.subplots(figsize=(11, 6))
    cols = plt.cm.viridis(np.linspace(0, 0.85, len(fam)))
    for (name, lab), c in zip(fam.items(), cols):
        g = best_per_session(work, name)
        if g.empty:
            continue
        main = name == "Squat (Barbell)"
        ax.plot(g["dt"], g["e1rm"], "o-" if main else "s--", ms=4,
                lw=2.6 if main else 1.4, color=c, label=lab, alpha=0.9)
    ax.set_title("Squat Family — e1RM Over Time (rebuild candidates)", fontweight="bold")
    ax.set_ylabel("Estimated 1RM (kg)")
    ax.legend(frameon=False, ncol=2, fontsize=9)
    ax.xaxis.set_major_formatter(mdates.DateFormatter("%b %y"))
    fig.tight_layout()
    fig.savefig(OUT / "04_squat_rebuild.png")
    plt.close()


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    work = load(sys.argv[1])
    chart_big3(work)
    chart_vs_projected()
    chart_movers(work)
    chart_squat(work)
    print(f"Charts written to {OUT}/")


if __name__ == "__main__":
    main()
