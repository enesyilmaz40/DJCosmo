import React, { useState, useMemo } from 'react';
import { Track } from '../types';
import {
  FolderOpen,
  Folder,
  FileAudio,
  Sparkles,
  Search,
  Music,
  Edit2,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Layers,
  List,
  RefreshCw,
  Trash2,
} from 'lucide-react';

export const getTrackFolderName = (t: Track): string => {
  if (t.folderName) return t.folderName;
  if (t.format === 'synth' || t.filePath.startsWith('synth://')) {
    return 'Demo Pack (Acid / Hard)';
  }
  if (t.filePath) {
    const parts = t.filePath.split(/[/\\]/);
    if (parts.length > 1) return parts[parts.length - 2];
  }
  return 'Imported Tracks';
};

interface LibraryProps {
  tracks: Track[];
  selectedFolder: string | null;
  onSelectFolder: (folder: string | null) => void;
  onOpenFolder: () => void;
  onOpenFiles: () => void;
  onGenerateDemoPack: () => void;
  onRescanFolders?: () => void;
  onLoadToDeck: (deckId: 'A' | 'B', track: Track) => void;
  onEditTrack: (track: Track) => void;
  onRemoveTracks: (tracks: Track[]) => void;
  isAnalyzing: boolean;
  analysisProgress: { current: number; total: number; trackTitle: string } | null;
  errorMessage: string | null;
  onDismissError: () => void;
}

export const Library: React.FC<LibraryProps> = ({
  tracks,
  selectedFolder,
  onSelectFolder,
  onOpenFolder,
  onOpenFiles,
  onGenerateDemoPack,
  onRescanFolders,
  onLoadToDeck,
  onEditTrack,
  onRemoveTracks,
  isAnalyzing,
  analysisProgress,
  errorMessage,
  onDismissError,
}) => {
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'flat' | 'grouped'>('grouped');
  const [collapsedFolders, setCollapsedFolders] = useState<Record<string, boolean>>({});
  const [sortField, setSortField] = useState<'default' | 'title' | 'artist' | 'bpm' | 'duration' | 'energy' | 'date'>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const handleSort = (field: 'default' | 'title' | 'artist' | 'bpm' | 'duration' | 'energy' | 'date') => {
    if (sortField === field) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection(field === 'bpm' || field === 'energy' || field === 'date' ? 'desc' : 'asc');
    }
  };

  // Compute unique folders and their counts
  const foldersMap = useMemo(() => {
    const map = new Map<string, { count: number; folderPath?: string }>();
    tracks.forEach(t => {
      const fName = getTrackFolderName(t);
      const existing = map.get(fName);
      if (existing) {
        existing.count++;
      } else {
        map.set(fName, { count: 1, folderPath: t.folderPath });
      }
    });
    return map;
  }, [tracks]);

  // Filter tracks by search and selected folder, then sort
  const filteredTracks = useMemo(() => {
    const list = tracks.filter(t => {
      const q = search.toLowerCase();
      const matchesSearch =
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        t.fileName.toLowerCase().includes(q) ||
        (t.analysis?.bpm && t.analysis.bpm.toString().includes(q));

      if (!matchesSearch) return false;

      if (selectedFolder) {
        return getTrackFolderName(t) === selectedFolder;
      }
      return true;
    });

    return [...list].sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'title':
          comparison = a.title.localeCompare(b.title);
          break;
        case 'artist':
          comparison = a.artist.localeCompare(b.artist);
          break;
        case 'bpm':
          comparison = (a.analysis?.bpm || 140) - (b.analysis?.bpm || 140);
          break;
        case 'duration':
          comparison = a.duration - b.duration;
          break;
        case 'energy':
          comparison = (a.analysis?.rmsEnergy || 0) - (b.analysis?.rmsEnergy || 0);
          break;
        case 'date':
          comparison = (a.mtimeMs || 0) - (b.mtimeMs || 0);
          break;
        default:
          comparison = 0;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [tracks, search, selectedFolder, sortField, sortDirection]);

  // Group tracks by folder for grouped view
  const groupedTracks = useMemo(() => {
    const groups: Record<string, Track[]> = {};
    filteredTracks.forEach(t => {
      const fName = getTrackFolderName(t);
      if (!groups[fName]) {
        groups[fName] = [];
      }
      groups[fName].push(t);
    });
    return groups;
  }, [filteredTracks]);

  const toggleFolderCollapse = (folderName: string) => {
    setCollapsedFolders(prev => ({
      ...prev,
      [folderName]: !prev[folderName],
    }));
  };

  const renderSortArrow = (field: string) => {
    if (sortField !== field) return null;
    return <span className="text-[#00ff66] ml-0.5">{sortDirection === 'asc' ? '▲' : '▼'}</span>;
  };

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const confirmRemoveTrack = (track: Track) => {
    if (window.confirm(`"${track.title}" listeden kaldırılsın mı?
(Dosya diskten silinmez, Auto DJ bir daha seçmez.)`)) {
      onRemoveTracks([track]);
    }
  };

  const confirmRemoveFolder = (folderName: string, folderTracks: Track[]) => {
    if (
      window.confirm(
        `"${folderName}" klasöründeki ${folderTracks.length} parça listeden kaldırılsın mı?
(Dosyalar diskten silinmez.)`
      )
    ) {
      onRemoveTracks(folderTracks);
    }
  };

  return (
    <div className="flex-1 bg-[#0b0e14] border border-[#1b2332] rounded-xl flex flex-col overflow-hidden shadow-2xl">
      {/* Top Toolbar */}
      <div className="p-2.5 bg-[#0f131c] border-b border-[#1b2332] flex items-center justify-between gap-3 flex-wrap">
        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenFolder}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#18202d] text-neutral-200 border border-[#243144] hover:bg-[#202b3d] hover:text-white flex items-center gap-1.5 transition-all"
            title="Import an entire folder of music"
          >
            <FolderOpen className="w-3.5 h-3.5 text-[#00e5ff]" />
            Add Folder
          </button>

          {onRescanFolders && (
            <button
              onClick={onRescanFolders}
              className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-[#18202d] text-neutral-300 border border-[#243144] hover:bg-[#202b3d] hover:text-[#00ff66] flex items-center gap-1 transition-all"
              title="Rescan watched folders for newly added songs"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Sync
            </button>
          )}

          <button
            onClick={onOpenFiles}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#18202d] text-neutral-200 border border-[#243144] hover:bg-[#202b3d] hover:text-white flex items-center gap-1.5 transition-all"
          >
            <FileAudio className="w-3.5 h-3.5 text-[#00ff66]" />
            Add Audio Files
          </button>

          <button
            onClick={onGenerateDemoPack}
            className="px-3 py-1.5 rounded-lg text-xs font-black bg-[#ff6b00]/15 text-[#ff8c33] border border-[#ff6b00]/40 hover:bg-[#ff6b00]/25 flex items-center gap-1.5 transition-all"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Instant Techno Pack
          </button>
        </div>

        {/* View Switcher & Search */}
        <div className="flex items-center gap-3 flex-1 justify-end max-w-md">
          {/* View Mode Toggle */}
          <div className="flex items-center bg-[#080a0e] border border-[#1e2738] rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('grouped')}
              className={`px-2 py-1 rounded text-[11px] font-bold flex items-center gap-1 transition-all ${
                viewMode === 'grouped'
                  ? 'bg-[#1b2434] text-[#00ff66]'
                  : 'text-neutral-400 hover:text-white'
              }`}
              title="Group by Folders"
            >
              <Layers className="w-3.5 h-3.5" />
              Folders
            </button>
            <button
              onClick={() => setViewMode('flat')}
              className={`px-2 py-1 rounded text-[11px] font-bold flex items-center gap-1 transition-all ${
                viewMode === 'flat'
                  ? 'bg-[#1b2434] text-[#00e5ff]'
                  : 'text-neutral-400 hover:text-white'
              }`}
              title="Flat Table View"
            >
              <List className="w-3.5 h-3.5" />
              Table
            </button>
          </div>

          {/* Search Box */}
          <div className="relative w-48">
            <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search library..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-[#080a0e] border border-[#20293a] rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-neutral-500 outline-none focus:border-[#00ff66]"
            />
          </div>
        </div>
      </div>

      {/* Analysis Banner */}
      {isAnalyzing && analysisProgress && (
        <div className="bg-[#121824] border-b border-[#202a3d] px-4 py-2 flex items-center justify-between text-xs text-[#00ff66]">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full border-2 border-[#00ff66] border-t-transparent animate-spin" />
            <span>Analyzing: {analysisProgress.trackTitle} ({analysisProgress.current} / {analysisProgress.total})</span>
          </div>
          <div className="w-32 h-1.5 bg-[#090b0f] rounded-full overflow-hidden">
            <div
              className="h-full bg-[#00ff66] transition-all"
              style={{ width: `${(analysisProgress.current / analysisProgress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Error Alert */}
      {errorMessage && (
        <div className="bg-red-950/40 border-b border-red-800/60 px-4 py-2 flex items-center justify-between text-xs text-red-300">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={onDismissError} className="text-[10px] underline hover:text-white">
            Dismiss
          </button>
        </div>
      )}

      {/* Dual Panel Body: Sidebar + Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar: Crates & Folders Tree */}
        <div className="w-56 bg-[#080a0e] border-r border-[#1a212e] flex flex-col p-2 gap-1 overflow-y-auto select-none">
          <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest px-2 py-1 flex items-center justify-between">
            <span>CRATES & FOLDERS</span>
            <span className="font-mono text-neutral-400">{foldersMap.size}</span>
          </div>

          {/* All Tracks Pill */}
          <button
            onClick={() => onSelectFolder(null)}
            className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center justify-between transition-all ${
              selectedFolder === null
                ? 'bg-[#15202e] text-[#00ff66] border border-[#00ff66]/40 shadow-[0_0_8px_rgba(0,255,102,0.15)]'
                : 'text-neutral-300 hover:bg-[#121620] hover:text-white'
            }`}
          >
            <div className="flex items-center gap-2 truncate">
              <FolderOpen className="w-3.5 h-3.5 text-[#00ff66]" />
              <span className="truncate">All Tracks</span>
            </div>
            <span className="text-[10px] font-mono px-1.5 py-0.2 bg-[#0d121a] rounded text-neutral-400">
              {tracks.length}
            </span>
          </button>

          {/* Individual Folders List */}
          {Array.from(foldersMap.entries()).map(([fName, info]) => {
            const isSelected = selectedFolder === fName;
            return (
              <button
                key={fName}
                onClick={() => onSelectFolder(fName)}
                className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center justify-between transition-all group ${
                  isSelected
                    ? 'bg-[#15202e] text-[#00e5ff] border border-[#00e5ff]/40 shadow-[0_0_8px_rgba(0,229,255,0.15)]'
                    : 'text-neutral-400 hover:bg-[#121620] hover:text-neutral-200'
                }`}
                title={fName}
              >
                <div className="flex items-center gap-2 truncate">
                  <Folder className={`w-3.5 h-3.5 ${isSelected ? 'text-[#00e5ff]' : 'text-neutral-500 group-hover:text-neutral-300'}`} />
                  <span className="truncate">{fName}</span>
                </div>
                <span className="text-[10px] font-mono px-1.5 py-0.2 bg-[#0d121a] rounded text-neutral-400">
                  {info.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Right Main Panel: Grouped Folders or Flat Table */}
        <div className="flex-1 overflow-y-auto">
          {filteredTracks.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-56 text-neutral-500 text-xs gap-2">
              <Music className="w-8 h-8 text-neutral-600" />
              <span>No tracks found in this folder.</span>
              <span className="text-[11px] text-neutral-600">
                Click &quot;Add Folder&quot; above to import your music collection.
              </span>
            </div>
          ) : viewMode === 'grouped' ? (
            /* Grouped View (Folder Accordions) */
            <div className="flex flex-col p-3 gap-3">
              {Object.entries(groupedTracks).map(([folderName, folderTracks]) => {
                const isCollapsed = collapsedFolders[folderName];
                const avgBpm = Math.round(
                  folderTracks.reduce((acc, t) => acc + (t.analysis?.bpm || 140), 0) / folderTracks.length
                );

                return (
                  <div
                    key={folderName}
                    className="border border-[#1a2333] rounded-lg overflow-hidden bg-[#0d1118]"
                  >
                    {/* Folder Header */}
                    <div
                      onClick={() => toggleFolderCollapse(folderName)}
                      className="px-3 py-2 bg-[#121722] hover:bg-[#161c2a] flex items-center justify-between cursor-pointer border-b border-[#1a2333] select-none transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        {isCollapsed ? (
                          <ChevronRight className="w-4 h-4 text-neutral-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-[#00ff66]" />
                        )}
                        <Folder className="w-4 h-4 text-[#00e5ff]" />
                        <span className="text-xs font-black text-white tracking-wide">
                          {folderName}
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#1b2332] text-neutral-300 font-bold">
                          {folderTracks.length} tracks
                        </span>
                        <span className="text-[10px] font-mono text-neutral-500">
                          Avg: {avgBpm} BPM
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-[10px] font-mono text-neutral-500">
                        <span>Click to {isCollapsed ? 'expand' : 'collapse'}</span>
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            confirmRemoveFolder(folderName, folderTracks);
                          }}
                          className="p-1 rounded text-neutral-500 hover:text-red-400 hover:bg-red-950/40 transition-all"
                          title="Remove these tracks from the library"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Folder Track Table */}
                    {!isCollapsed && (
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-[#171d28] bg-[#090c12] text-[10px] font-bold text-neutral-400 uppercase tracking-wider select-none">
                            <th onClick={() => handleSort('date')} className="py-2 px-3 w-12 cursor-pointer hover:text-white" title="Sort by Date Added / File Order">
                              # {renderSortArrow('date')}
                            </th>
                            <th onClick={() => handleSort('title')} className="py-2 px-3 cursor-pointer hover:text-white" title="Sort by Track Title">
                              Title {renderSortArrow('title')}
                            </th>
                            <th onClick={() => handleSort('artist')} className="py-2 px-3 cursor-pointer hover:text-white" title="Sort by Artist">
                              Artist {renderSortArrow('artist')}
                            </th>
                            <th onClick={() => handleSort('duration')} className="py-2 px-3 cursor-pointer hover:text-white" title="Sort by Duration">
                              Duration {renderSortArrow('duration')}
                            </th>
                            <th onClick={() => handleSort('bpm')} className="py-2 px-3 cursor-pointer hover:text-white" title="Sort by BPM">
                              BPM {renderSortArrow('bpm')}
                            </th>
                            <th onClick={() => handleSort('energy')} className="py-2 px-3 cursor-pointer hover:text-white" title="Sort by Energy Level">
                              Energy {renderSortArrow('energy')}
                            </th>
                            <th className="py-2 px-3">Key</th>
                            <th className="py-2 px-3">Grid Status</th>
                            <th className="py-2 px-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#131722] font-mono">
                          {folderTracks.map((track, idx) => (
                            <TrackTableRow
                              key={track.id}
                              track={track}
                              index={idx + 1}
                              onLoadToDeck={onLoadToDeck}
                              onEditTrack={onEditTrack}
                              onRemoveTrack={confirmRemoveTrack}
                              formatDuration={formatDuration}
                            />
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            /* Flat Table View */
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#171d28] bg-[#0c0f16] text-[10px] font-bold text-neutral-400 uppercase tracking-wider sticky top-0 z-10 select-none">
                  <th onClick={() => handleSort('date')} className="py-2.5 px-3 w-12 cursor-pointer hover:text-white" title="Sort by Date Added / File Order">
                    # {renderSortArrow('date')}
                  </th>
                  <th onClick={() => handleSort('title')} className="py-2.5 px-3 cursor-pointer hover:text-white" title="Sort by Track Title">
                    Title {renderSortArrow('title')}
                  </th>
                  <th onClick={() => handleSort('artist')} className="py-2.5 px-3 cursor-pointer hover:text-white" title="Sort by Artist">
                    Artist {renderSortArrow('artist')}
                  </th>
                  <th className="py-2.5 px-3">Folder</th>
                  <th onClick={() => handleSort('duration')} className="py-2.5 px-3 cursor-pointer hover:text-white" title="Sort by Duration">
                    Duration {renderSortArrow('duration')}
                  </th>
                  <th onClick={() => handleSort('bpm')} className="py-2.5 px-3 cursor-pointer hover:text-white" title="Sort by BPM">
                    BPM {renderSortArrow('bpm')}
                  </th>
                  <th onClick={() => handleSort('energy')} className="py-2.5 px-3 cursor-pointer hover:text-white" title="Sort by Energy Level">
                    Energy {renderSortArrow('energy')}
                  </th>
                  <th className="py-2.5 px-3">Key</th>
                  <th className="py-2.5 px-3">Grid Status</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#131722] font-mono">
                {filteredTracks.map((track, idx) => (
                  <TrackTableRow
                    key={track.id}
                    track={track}
                    index={idx + 1}
                    showFolderCol
                    folderName={getTrackFolderName(track)}
                    onLoadToDeck={onLoadToDeck}
                    onEditTrack={onEditTrack}
                    onRemoveTrack={confirmRemoveTrack}
                    formatDuration={formatDuration}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

// Sub-component for individual track row
interface TrackTableRowProps {
  track: Track;
  index: number;
  showFolderCol?: boolean;
  folderName?: string;
  onLoadToDeck: (deckId: 'A' | 'B', track: Track) => void;
  onEditTrack: (track: Track) => void;
  onRemoveTrack: (track: Track) => void;
  formatDuration: (secs: number) => string;
}

const TrackTableRow: React.FC<TrackTableRowProps> = ({
  track,
  index,
  showFolderCol,
  folderName,
  onLoadToDeck,
  onEditTrack,
  onRemoveTrack,
  formatDuration,
}) => {
  const keyLabel = track.analysis?.camelotKey
    ? `${track.analysis.camelotKey}${track.analysis.keyConfidence !== undefined && track.analysis.keyConfidence < 0.5 ? '?' : ''}`
    : '---';
  const bpm = track.analysis?.bpm || '---';
  const energy =
    track.analysis?.rmsEnergy !== undefined
      ? `${Math.round(track.analysis.rmsEnergy * 100)}%`
      : '---';

  return (
    <tr className="hover:bg-[#121721] transition-colors group">
      <td className="py-2 px-3 text-neutral-500 text-[11px]">
        {index.toString().padStart(2, '0')}
      </td>
      <td className="py-2 px-3 font-sans font-bold text-white max-w-[200px] truncate">
        {track.title}
      </td>
      <td className="py-2 px-3 font-sans text-neutral-400 max-w-[150px] truncate">
        {track.artist}
      </td>
      {showFolderCol && (
        <td className="py-2 px-3 text-[10px] font-sans text-[#00e5ff] max-w-[120px] truncate">
          <span className="px-1.5 py-0.5 rounded bg-[#131b26] border border-[#1d293b]">
            📁 {folderName}
          </span>
        </td>
      )}
      <td className="py-2 px-3 text-neutral-400 text-[11px]">
        {formatDuration(track.duration)}
      </td>
      <td className="py-2 px-3 font-bold text-[#00ff66]">{bpm}</td>
      <td className="py-2 px-3 text-neutral-300">
        <div className="flex items-center gap-1.5">
          <div className="w-12 h-1.5 bg-[#171d28] rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-amber-500"
              style={{
                width: track.analysis?.rmsEnergy ? `${track.analysis.rmsEnergy * 100}%` : '0%',
              }}
            />
          </div>
          <span className="text-[10px] text-neutral-400">{energy}</span>
        </div>
      </td>
      <td
        className="py-2 px-3 text-[11px] text-[#c58cff]"
        title={track.analysis?.musicalKey ? `${track.analysis.musicalKey}${track.analysis.keyConfidence !== undefined ? ` (confidence ${Math.round(track.analysis.keyConfidence * 100)}%)` : ''}` : ''}
      >
        {keyLabel}
      </td>
      <td className="py-2 px-3 text-[10px]">
        {track.isCustomEdited ? (
          <span className="text-blue-400 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> User Edited
          </span>
        ) : track.analysis?.isConfident ? (
          <span className="text-emerald-400 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> DSP Locked
          </span>
        ) : (
          <span className="text-amber-400 flex items-center gap-1">Estimated</span>
        )}
      </td>
      <td className="py-2 px-3 text-right">
        <div className="flex items-center justify-end gap-1.5">
          <button
            onClick={() => onEditTrack(track)}
            className="p-1 rounded bg-[#161c27] text-neutral-400 hover:text-white hover:bg-[#1f2838] transition-all"
            title="Edit Grid & Cue Points"
          >
            <Edit2 className="w-3 h-3" />
          </button>
          <button
            onClick={() => onLoadToDeck('A', track)}
            className="px-2 py-0.5 rounded text-[10px] font-black bg-[#00ff66]/15 hover:bg-[#00ff66]/30 text-[#00ff66] border border-[#00ff66]/40 transition-all"
          >
            LOAD A
          </button>
          <button
            onClick={() => onLoadToDeck('B', track)}
            className="px-2 py-0.5 rounded text-[10px] font-black bg-[#00e5ff]/15 hover:bg-[#00e5ff]/30 text-[#00e5ff] border border-[#00e5ff]/40 transition-all"
          >
            LOAD B
          </button>
          <button
            onClick={() => onRemoveTrack(track)}
            className="p-1 rounded bg-[#161c27] text-neutral-500 hover:text-red-400 hover:bg-red-950/40 transition-all"
            title="Remove from library"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </td>
    </tr>
  );
};
