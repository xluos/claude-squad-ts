import { Box, Text } from 'ink';
import React, { useState } from 'react';
import type { Profile } from '../../shared/types.js';
import { MultilineInput } from '../input/MultilineInput.js';

export interface TextInputOverlayProps {
  title: string;
  placeholder?: string;
  width: number;
  /** Optional dropdown of profiles (program presets). */
  profiles?: Profile[];
  selectedProfile?: string;
  onProfileChange?: (name: string) => void;
  /** Optional branch picker. Pass the current results + filter callback. */
  branches?: string[];
  selectedBranch?: string;
  onBranchSelect?: (name: string) => void;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

export function TextInputOverlay({
  title,
  placeholder,
  width,
  profiles,
  selectedProfile,
  onProfileChange,
  branches,
  selectedBranch,
  onBranchSelect,
  onSubmit,
  onCancel,
}: TextInputOverlayProps): React.ReactElement {
  const [value, setValue] = useState('');

  return (
    <Box
      flexDirection="column"
      borderStyle="double"
      borderColor="cyan"
      paddingX={2}
      paddingY={1}
      width={width}
    >
      <Text bold color="cyan">
        {title}
      </Text>
      {profiles && profiles.length > 1 && (
        <ProfilePicker
          profiles={profiles}
          selected={selectedProfile}
          onChange={onProfileChange ?? (() => undefined)}
        />
      )}
      <Box marginTop={1}>
        <MultilineInput
          width={width - 6}
          rows={5}
          placeholder={placeholder}
          onChange={setValue}
          onSubmit={onSubmit}
          onCancel={onCancel}
        />
      </Box>
      {branches && (
        <BranchPicker
          branches={branches}
          selected={selectedBranch}
          onSelect={onBranchSelect ?? (() => undefined)}
        />
      )}
      <Box marginTop={1}>
        <Text color="gray">↵ submit · Esc cancel · {value.length} chars</Text>
      </Box>
    </Box>
  );
}

interface ProfilePickerProps {
  profiles: Profile[];
  selected?: string;
  onChange: (name: string) => void;
}

function ProfilePicker({ profiles, selected }: ProfilePickerProps): React.ReactElement {
  // onChange is reserved for future keyboard cycling (Tab between profiles).
  return (
    <Box marginTop={1}>
      <Text color="gray">profile: </Text>
      {profiles.map((p, i) => (
        <React.Fragment key={p.name}>
          {i > 0 && <Text color="gray"> / </Text>}
          <Text color={p.name === selected ? 'yellow' : 'white'} bold={p.name === selected}>
            {p.name}
          </Text>
        </React.Fragment>
      ))}
    </Box>
  );
}

interface BranchPickerProps {
  branches: string[];
  selected?: string;
  onSelect: (name: string) => void;
}

function BranchPicker({ branches, selected }: BranchPickerProps): React.ReactElement {
  if (branches.length === 0) {
    return (
      <Box marginTop={1}>
        <Text color="gray">(no matching branches)</Text>
      </Box>
    );
  }
  const visible = branches.slice(0, 5);
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color="gray">branches:</Text>
      {visible.map((b) => (
        <Text key={b} color={b === selected ? 'yellow' : 'white'}>
          {b === selected ? '▶ ' : '  '}
          {b}
        </Text>
      ))}
      {branches.length > visible.length && (
        <Text color="gray">… +{branches.length - visible.length} more</Text>
      )}
    </Box>
  );
}
