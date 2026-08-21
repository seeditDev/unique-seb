import { A2Z_SHEET_DATA } from './a2zSheetData';

import blind75 from './sheets/blind75.json';
import sde from './sheets/sde.json';
import striver79 from './sheets/striver79.json';
import cn from './sheets/cn.json';
import dbms from './sheets/dbms.json';
import os from './sheets/os.json';
import sysdesign from './sheets/sysdesign.json';
import playlistArray from './sheets/playlist-array.json';
import playlistBinarySearch from './sheets/playlist-binarysearch.json';
import playlistDp from './sheets/playlist-dp.json';
import playlistGraph from './sheets/playlist-graph.json';
import playlistLinkedList from './sheets/playlist-linkedlist.json';
import playlistRecursion from './sheets/playlist-recursion.json';
import playlistStackQueue from './sheets/playlist-stackqueue.json';
import playlistString from './sheets/playlist-string.json';
import playlistTrees from './sheets/playlist-trees.json';
import cp from './sheets/cp.json';

export const CATEGORIZED_SHEETS = {
  "DSA Sheets": [
    {
      id: 'a2z',
      title: "A2Z Sheet",
      desc: "Master DSA from Basics to Advanced step-by-step.",
      borderColor: "#E76A40",
      buttonType: "track",
      tag: "DSA Sheets",
      sections: A2Z_SHEET_DATA
    },
    { ...blind75, id: 'blind75', title: "Blind 75 Sheet", desc: "Interview Problems with Video Solutions", borderColor: "#E5A48B", buttonType: "track", tag: "DSA Sheets" },
    { ...sde, id: 'sde', title: "SDE Sheet", desc: "Most Frequently Asked Interview Questions", borderColor: "#38bdf8", buttonType: "track", tag: "DSA Sheets" },
    { ...striver79, id: 'striver79', title: "SEED-IT 79 Sheet", desc: "Last Minute Preparation", borderColor: "#A99CE3", buttonType: "track", tag: "DSA Sheets" }
  ],
  "Core Cs Subjects": [
    { ...cn, id: 'cn', title: "CN Sheet", desc: "Most Asked Computer Networks Interview Questions", borderColor: "#06b6d4", buttonType: "track", tag: "Core Cs Subjects" },
    { ...dbms, id: 'dbms', title: "DBMS Sheet", desc: "Most Asked DBMS Interview Questions", borderColor: "#3b82f6", buttonType: "track", tag: "Core Cs Subjects" },
    { ...os, id: 'os', title: "OS Sheet", desc: "Most Asked Operating System Interview Questions", borderColor: "#ef4444", buttonType: "track", tag: "Core Cs Subjects" }
  ],
  "System Design": [
    { ...sysdesign, id: 'sysdesign', title: "System Design Sheet", desc: "Master HLD from Basics to Advanced", borderColor: "#8FD0B3", buttonType: "track", tag: "System Design" }
  ],
  "DSA Playlist": [
    { ...playlistArray, id: 'playlist-array', title: "Array", desc: "Learn from Basics to Advanced", borderColor: "#fb923c", buttonType: "track", tag: "DSA Playlist" },
    { ...playlistBinarySearch, id: 'playlist-binarysearch', title: "Binary Search", desc: "Learn from Basics to Advanced", borderColor: "#facc15", buttonType: "track", tag: "DSA Playlist" },
    { ...playlistDp, id: 'playlist-dp', title: "Dynamic Programming", desc: "Learn from Basics to Advanced", borderColor: "#4ade80", buttonType: "track", tag: "DSA Playlist" },
    { ...playlistGraph, id: 'playlist-graph', title: "Graphs", desc: "Learn from Basics to Advanced", borderColor: "#2dd4bf", buttonType: "track", tag: "DSA Playlist" },
    { ...playlistLinkedList, id: 'playlist-linkedlist', title: "Linked Lists", desc: "Learn from Basics to Advanced", borderColor: "#60a5fa", buttonType: "track", tag: "DSA Playlist" },
    { ...playlistRecursion, id: 'playlist-recursion', title: "Recursion", desc: "Learn from Basics to Advanced", borderColor: "#818cf8", buttonType: "track", tag: "DSA Playlist" },
    { ...playlistStackQueue, id: 'playlist-stackqueue', title: "Stack and Queue", desc: "Learn from Basics to Advanced", borderColor: "#c084fc", buttonType: "track", tag: "DSA Playlist" },
    { ...playlistString, id: 'playlist-string', title: "Strings", desc: "Learn from Basics to Advanced", borderColor: "#f472b6", buttonType: "track", tag: "DSA Playlist" },
    { ...playlistTrees, id: 'playlist-trees', title: "Trees", desc: "Learn from Basics to Advanced", borderColor: "#fb7185", buttonType: "track", tag: "DSA Playlist" }
  ],
  "Competitive Programming": [
    { ...cp, id: 'cp', title: "CP Sheet", desc: "Level up your CP with our curated sheet", borderColor: "#ef4444", buttonType: "track", tag: "Competitive Programming" }
  ]
};
