using System.Security.Cryptography;
using Solarzed.Api.Domain;

namespace Solarzed.Api.Application;

public record CreateClaimRequest(string WarrantyCode, string Channel, string Description, string? RequiredDocuments);

public record UpdateClaimRequest(
    int Revision, string Stage, string Cause, string Decision, string? DecisionNote,
    string Remedy, string? RemedyNote, string? RequiredDocuments,
    decimal? LaborCost, decimal? PartsCost, decimal? OtherCost, string? Reason);

public record ClaimDue(DateTime AcknowledgeBy, DateTime InitialReviewBy, DateTime? DecisionBy, bool Overdue, string? OverdueStage);

/// <summary>Claim workflow rules and the service-time targets from the warranty policy (§5).</summary>
public static class ClaimService
{
    // Proposed service targets (business days). They are operational goals, not legal deadlines.
    public const int AcknowledgeDays = 2, InitialReviewDays = 3, DecisionDays = 7;

    // Business days skip Friday (the Iranian weekend). Adjust here if a market uses a different week.
    static readonly DayOfWeek[] Weekend = [DayOfWeek.Friday];

    public static DateTime AddBusinessDays(DateTime start, int days)
    {
        var d = start;
        while (days > 0)
        {
            d = d.AddDays(1);
            if (!Weekend.Contains(d.DayOfWeek)) days--;
        }
        return d;
    }

    public static ClaimDue Due(WarrantyClaim c, DateTime now)
    {
        var ack = AddBusinessDays(c.CreatedAt, AcknowledgeDays);
        var review = AddBusinessDays(c.CreatedAt, InitialReviewDays);
        DateTime? decision = c.DocumentsCompleteAt is { } docs ? AddBusinessDays(docs, DecisionDays) : null;
        string? late = c.Stage switch
        {
            ClaimStage.Received when now > ack => "acknowledge",
            ClaimStage.InitialReview when now > review => "initialReview",
            ClaimStage.TechnicalAssessment when decision is { } by && now > by => "decision",
            _ => null,
        };
        return new ClaimDue(ack, review, decision, late != null, late);
    }

    public static string NewId(DateTime now)
    {
        const string chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        Span<char> tail = stackalloc char[5];
        for (var i = 0; i < tail.Length; i++) tail[i] = chars[RandomNumberGenerator.GetInt32(chars.Length)];
        return $"CL-{now:yyMMdd}-{new string(tail)}";
    }

    static string? Trim(string? v, int max) => string.IsNullOrWhiteSpace(v) ? null : v.Trim() is var t && t.Length > max ? t[..max] : v.Trim();

    /// <summary>Validates and applies an update. Returns an error message, or null when the claim was changed.</summary>
    public static string? Apply(WarrantyClaim c, UpdateClaimRequest r, DateTime now)
    {
        if (!Enum.TryParse<ClaimStage>(r.Stage, true, out var stage) || !Enum.IsDefined(stage)) return "Invalid stage.";
        if (!Enum.TryParse<ClaimCause>(r.Cause, true, out var cause) || !Enum.IsDefined(cause)) return "Invalid cause.";
        if (!Enum.TryParse<ClaimDecision>(r.Decision, true, out var decision) || !Enum.IsDefined(decision)) return "Invalid decision.";
        if (!Enum.TryParse<ClaimRemedy>(r.Remedy, true, out var remedy) || !Enum.IsDefined(remedy)) return "Invalid remedy.";
        foreach (var cost in new[] { r.LaborCost, r.PartsCost, r.OtherCost })
            if (cost is < 0 or > 1_000_000_000_000m) return "Costs must be zero or positive.";
        if ((r.DecisionNote?.Length ?? 0) > 1000 || (r.RemedyNote?.Length ?? 0) > 1000 || (r.RequiredDocuments?.Length ?? 0) > 1000 || (r.Reason?.Length ?? 0) > 1000)
            return "Notes are limited to 1000 characters.";

        var final = decision is ClaimDecision.Accepted or ClaimDecision.Rejected;
        // A final decision moves the claim to the decision stage at the latest.
        if (final && stage < ClaimStage.Decided) stage = ClaimStage.Decided;
        if (stage >= ClaimStage.Decided && !final) return "Record an accepted or rejected decision before this stage.";
        if (final && cause == ClaimCause.Undetermined) return "Determine the cause (film, installation, vehicle or external) before deciding.";
        if (decision == ClaimDecision.Rejected && string.IsNullOrWhiteSpace(r.DecisionNote)) return "A rejection requires a documented reason.";
        if (stage == ClaimStage.Closed && decision == ClaimDecision.Accepted && remedy == ClaimRemedy.None) return "Choose the remedy that was carried out before closing.";
        if (decision == ClaimDecision.Rejected && remedy != ClaimRemedy.None) return "A rejected claim has no remedy.";
        if (stage < c.Stage && string.IsNullOrWhiteSpace(r.Reason)) return "Moving a claim back to an earlier stage requires a reason.";

        c.Stage = stage; c.Cause = cause; c.Decision = decision; c.Remedy = remedy;
        c.DecisionNote = Trim(r.DecisionNote, 1000); c.RemedyNote = Trim(r.RemedyNote, 1000);
        c.RequiredDocuments = Trim(r.RequiredDocuments, 1000);
        c.LaborCost = r.LaborCost; c.PartsCost = r.PartsCost; c.OtherCost = r.OtherCost;

        // Stage timestamps: set on first entry, cleared when the claim is reopened before that stage.
        c.AcknowledgedAt = stage >= ClaimStage.InitialReview ? c.AcknowledgedAt ?? now : null;
        c.InitialReviewedAt = stage >= ClaimStage.TechnicalAssessment ? c.InitialReviewedAt ?? now : null;
        c.DocumentsCompleteAt = stage >= ClaimStage.TechnicalAssessment ? c.DocumentsCompleteAt ?? now : null;
        c.DecidedAt = stage >= ClaimStage.Decided ? c.DecidedAt ?? now : null;
        c.ClosedAt = stage == ClaimStage.Closed ? c.ClosedAt ?? now : null;
        c.UpdatedAt = now;
        c.Revision++;
        return null;
    }
}
