#!/usr/bin/env Rscript

suppressPackageStartupMessages(library(ape))

args <- commandArgs(trailingOnly = TRUE)
if (length(args) != 2L) {
  stop("Usage: build_catnip10_game_data.R <benchmark_dir> <output_js>")
}

benchmark_dir <- normalizePath(args[[1]], mustWork = TRUE)
output_js <- normalizePath(args[[2]], mustWork = FALSE)
source(file.path(benchmark_dir, "scripts", "oracle_utils.R"))

tree <- read.tree(file.path(benchmark_dir, "inputs", "example_tree.nwk"))
if (is.rooted(tree)) {
  tree <- unroot(tree)
}

frozen <- freeze_full_tree_identity(tree, tree_semantics = "unrooted")
identity_tbl <- frozen$identity_tbl
root_label <- frozen$root_label

branch_map <- read.delim(
  file.path(benchmark_dir, "outputs", "t10_global_deletion", "branch_label_map.tsv"),
  stringsAsFactors = FALSE,
  check.names = FALSE
)
branch_map <- branch_map[branch_map$splitaligner_branch != "-", , drop = FALSE]
branch_map$branch_num <- as.integer(sub("^B", "", branch_map$splitaligner_branch))
branch_map <- branch_map[order(branch_map$branch_num), , drop = FALSE]

axis_ids <- branch_map$splitaligner_branch
oracle_ids <- branch_map$benchmark_unrooted_branch
tip_ids <- paste0("t", seq_len(10L))

classify_deleted <- function(deleted_tips) {
  state <- init_graph_state(identity_tbl, root_label, tree_semantics = "unrooted")
  if (length(deleted_tips) > 0L) {
    for (tip in deleted_tips) {
      state <- delete_tip_once(state, tip)$state
    }
  }
  state_to_classification(state, identity_tbl)
}

encode_classification <- function(classification) {
  values <- classification$line[oracle_ids]
  statuses <- ifelse(values == "NA_struct", "S", ifelse(values == "NA_fuse", "F", "O"))

  fusion_groups <- lapply(classification$merge_groups, function(members) {
    branch_ids <- branch_map$splitaligner_branch[
      match(members, branch_map$benchmark_unrooted_branch)
    ]
    if (anyNA(branch_ids)) {
      stop("A fusion group contains an unmapped oracle branch")
    }
    branch_ids <- branch_ids[order(as.integer(sub("^B", "", branch_ids)))]
    paste(branch_ids, collapse = "|")
  })

  list(
    status = paste(statuses, collapse = ""),
    groups = sort(unlist(fusion_groups, use.names = FALSE))
  )
}

state_rows <- list()
for (mask in 0:(2^length(tip_ids) - 1L)) {
  deleted <- tip_ids[vapply(
    seq_along(tip_ids),
    function(i) bitwAnd(mask, bitwShiftL(1L, i - 1L)) != 0L,
    logical(1)
  )]
  if ((length(tip_ids) - length(deleted)) < 3L) {
    next
  }

  forward <- encode_classification(classify_deleted(deleted))
  reverse_order <- encode_classification(classify_deleted(rev(deleted)))
  if (!identical(forward, reverse_order)) {
    stop(sprintf("Deletion-order invariance failed for mask %d", mask))
  }
  state_rows[[as.character(mask)]] <- forward
}

if (length(state_rows) != 968L) {
  stop(sprintf("Expected 968 valid retained-taxon states, found %d", length(state_rows)))
}

canonical_order <- c("t10", "t1", "t8", "t7", "t4", "t9", "t5")
oracle_long <- read.delim(
  file.path(
    benchmark_dir,
    "outputs",
    "t10_global_deletion",
    "benchmark_unrooted",
    "oracle_cell_status_long.tsv"
  ),
  stringsAsFactors = FALSE,
  check.names = FALSE
)

deleted <- character()
for (step_id in 0:length(canonical_order)) {
  if (step_id > 0L) {
    deleted <- c(deleted, canonical_order[[step_id]])
  }
  mask <- sum(vapply(
    seq_along(tip_ids),
    function(i) if (tip_ids[[i]] %in% deleted) bitwShiftL(1L, i - 1L) else 0L,
    integer(1)
  ))
  step_rows <- oracle_long[oracle_long$step_id == step_id, , drop = FALSE]
  expected_values <- step_rows$status[match(oracle_ids, step_rows$branch_id)]
  expected <- paste(ifelse(
    expected_values == "NA_struct",
    "S",
    ifelse(expected_values == "NA_fuse", "F", "O")
  ), collapse = "")
  if (!identical(state_rows[[as.character(mask)]]$status, expected)) {
    stop(sprintf("Packaged oracle regression failed at canonical step %d", step_id))
  }
}

quote_js <- function(x) {
  paste0('"', gsub('"', '\\\\"', x, fixed = TRUE), '"')
}

axis_lines <- vapply(seq_along(axis_ids), function(i) {
  kind <- if (grepl("^t", oracle_ids[[i]])) "terminal" else "internal"
  paste0(
    "    {id:", quote_js(axis_ids[[i]]),
    ",oracle:", quote_js(oracle_ids[[i]]),
    ",kind:", quote_js(kind), "}"
  )
}, character(1))

state_keys <- as.integer(names(state_rows))
state_keys <- state_keys[order(state_keys)]
state_lines <- vapply(state_keys, function(mask) {
  row <- state_rows[[as.character(mask)]]
  groups_js <- if (length(row$groups) == 0L) {
    "[]"
  } else {
    paste0("[", paste(quote_js(row$groups), collapse = ","), "]")
  }
  paste0("    ", quote_js(as.character(mask)), ":[", quote_js(row$status), ",", groups_js, "]")
}, character(1))

lines <- c(
  "(function(){",
  '  "use strict";',
  "  window.CATNIP10_GAME_DATA={",
  '  version:"2026-07-11",',
  paste0("  tips:[", paste(quote_js(tip_ids), collapse = ","), "],"),
  paste0("  canonicalOrder:[", paste(quote_js(canonical_order), collapse = ","), "],"),
  "  axis:[",
  paste0(axis_lines, collapse = ",\n"),
  "  ],",
  "  states:{",
  paste0(state_lines, collapse = ",\n"),
  "  }",
  "  };",
  "})();",
  ""
)

writeLines(lines, output_js, useBytes = TRUE)
cat(sprintf(
  "Wrote %s with %d states; canonical 136-cell path and order invariance passed.\n",
  output_js,
  length(state_rows)
))
