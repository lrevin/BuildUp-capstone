import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Text } from '../components/Text';
import {
  Asset,
  ImagePickerResponse,
  launchCamera,
  launchImageLibrary,
} from 'react-native-image-picker';
import {
  keepLocalCopy,
  pick as pickDocuments,
  types as docTypes,
} from '@react-native-documents/picker';
import {
  Building2,
  FileText,
  Paperclip,
  ChevronRight,
  TrendingUp,
  Settings,
  Camera,
  ClipboardList,
  Images,
  KeyRound,
  LogOut,
  Menu,
  Minus,
  Package,
  Plus,
  Star,
  Users,
  X,
} from 'lucide-react-native';
import { fetchMaterials, fetchSite, submitReport } from '../api/buildup';
import { currentPlace } from '../location';
import { errorMessage } from '../api/client';
import { useAuth, useUser } from '../auth';
import { useDialog } from '../components/Dialog';
import MenuSheet from '../components/MenuSheet';
import ProgressRing from '../components/ProgressRing';
import { EMPTY_WORKLOG } from '../components/WorkLog';
import { WorkTagInput } from '../components/WorkTags';
import { addWork, joinWorks, splitWorks } from '../utils/works';
import PhotoViewer from '../components/PhotoViewer';
import SubmitSheet from '../components/SubmitSheet';
import {
  AppHeader,
  BottomBar,
  Button,
  Card,
  IconButton,
} from '../components/ui';
import MaterialRowsEditor, {
  MaterialRow,
  emptyMaterialRow,
  itemsFromRows,
} from '../components/MaterialRowsEditor';
import { formatQty } from '../components/Material';
import { ScreenProps } from '../navigation';
import { colors, radius } from '../theme';
import { MaterialRequest, PhotoPhase, PickedFile, Site } from '../types';
import { draftStore } from '../data/storage';
import { formatDate, formatTime, isToday, pct } from '../utils/format';

const STEP = 1;
const MAX_FILES = 5;
const MAX_FILE_MB = 20;
// 첨부할 수 있는 문서(서버 FileStorage.DOC_ALLOWED와 같음)
const DOC_EXT = [
  'pdf',
  'xls',
  'xlsx',
  'csv',
  'hwp',
  'hwpx',
  'doc',
  'docx',
  'ppt',
  'pptx',
  'txt',
  'zip',
];

// 1.2MB, 340KB
export const fileSize = (bytes: number | null | undefined) =>
  !bytes
    ? ''
    : bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)}MB`
    : `${Math.max(1, Math.round(bytes / 1024))}KB`;
const ICON = { size: 20, color: colors.text, strokeWidth: 2 };

const round1 = (v: number) => Math.round(v * 10) / 10;

// 사진은 작업 전 / 작업 후로 나눠 올린다(장수 제한 없음)
type PhotoPick = Asset & { phase: PhotoPhase };
const PHASES: { phase: PhotoPhase; label: string }[] = [
  { phase: 'before', label: '작업 전' },
  { phase: 'after', label: '작업 후' },
];

// 오늘 작업 평점: 0.5 ~ 5.0점, 소수점 한 자리
const RATING_MIN = 0.5;
const RATING_MAX = 5;
const STAR_SIZE = 32;

// 공정 하나의 진행률을 바꿨을 때 현장 전체 진행률(가중치 반영)
function weightedAfter(
  processes: { key: string; weight: number; progress: number }[],
  key: string,
  value: number,
) {
  const total = processes.reduce((acc, p) => acc + p.weight, 0);
  if (total <= 0) {
    return 0;
  }
  const sum = processes.reduce(
    (acc, p) => acc + (p.key === key ? value : p.progress) * p.weight,
    0,
  );
  return Math.round((sum / total) * 10) / 10;
}

export default function ReportScreen({
  navigation,
  route,
}: ScreenProps<'Report'>) {
  const { siteId } = route.params;
  const { logout } = useAuth();
  const user = useUser();
  const dialog = useDialog();
  const [site, setSite] = useState<Site | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [works, setWorks] = useState<string[]>([]); // 진행한 작업(태그)
  const [workText, setWorkText] = useState(''); // 아직 태그가 안 된 입력 중인 작업
  // 자동 계산 현장: 이번에 보고할 공정(value는 그 공정의 진행률)
  const [procKey, setProcKey] = useState<string | null>(null);
  const procKeyRef = useRef<string | null>(null);
  procKeyRef.current = procKey;
  const lastProcBase = useRef(0); // 직전에 받은 고른 공정의 진행률
  const [files, setFiles] = useState<PickedFile[]>([]);
  // 입력 중인 현장 전체 진행률(보고하는 사람이 판단). null = 아직 불러오기 전
  const [value, setValue] = useState<number | null>(null);
  const [valueText, setValueText] = useState<string | null>(null); // 숫자 직접 입력 중
  const [memo, setMemo] = useState('');
  const [memoFocused, setMemoFocused] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [photos, setPhotos] = useState<PhotoPick[]>([]);
  // 오늘 사용한 자재(승인되면 현장 재고에서 빠진다), 현장 관리자의 오늘 작업 평점
  const [usedRows, setUsedRows] = useState<MaterialRow[]>([emptyMaterialRow()]);
  const [rating, setRating] = useState<number | null>(null);
  const [viewing, setViewing] = useState<number | null>(null);
  const [materials, setMaterials] = useState<MaterialRequest[]>([]);
  // 임시저장: 처음 한 번 불러온 뒤부터 입력이 바뀔 때마다 저장
  const hydrated = useRef(false);
  // 직전에 받은 현장 진행률(내가 올린 값과, 보고 삭제로 내려간 값을 구분하려고)
  const lastBase = useRef(0);
  const [restoredAt, setRestoredAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoadError(false);
      const s = await fetchSite(siteId);
      setSite(s);
      const prevBase = lastBase.current;
      lastBase.current = s.overallProgress;
      // 자재 요청 현황(실패해도 보고 작성에는 지장 없음)
      fetchMaterials(siteId)
        .then(setMaterials)
        .catch(() => {});
      if (!hydrated.current) {
        // 처음 들어올 때: 기준값 + 작성 중이던 임시저장 내용
        // (자동 계산 현장은 고른 공정의 진행률이 기준값)
        const draft = await draftStore.load(user.id, siteId);
        const auto = s.progressMode === 'auto';
        const draftProc = auto
          ? s.processes?.find(x => x.key === draft?.processKey)
          : undefined;
        let base = auto ? draftProc?.progress ?? 0 : s.overallProgress;
        if (auto) {
          setProcKey(draftProc?.key ?? null);
          lastProcBase.current = draftProc?.progress ?? 0;
        }
        if (draft && (!auto || draftProc)) {
          base = Math.min(100, Math.max(base, draft.value ?? base));
        }
        if (draft) {
          setWorks(splitWorks(draft.work));
          setWorkText(draft.workText ?? '');
          setMemo(draft.memo);
          setPhotos(
            draft.photoUris.map((uri, i) => ({
              uri,
              phase: draft.photoPhases?.[i] ?? 'after',
            })),
          );
          setRating(draft.rating ?? null);
          if (draft.materials && draft.materials.length > 0) {
            setUsedRows(
              draft.materials.map(m => ({ ...emptyMaterialRow(), ...m })),
            );
          }
          setFiles(draft.files ?? []);
          setRestoredAt(draft.savedAt);
        }
        setValue(base);
        hydrated.current = true;
      } else {
        // 다른 사람이 보고했거나 보고가 지워졌으면 입력값을 최신 진행률에 맞춘다
        // (사용자가 직전 기준값보다 올려 둔 값만 유지, 보고 삭제로 내려간 차이는 버림)
        const auto = s.progressMode === 'auto';
        const p = auto
          ? s.processes?.find(x => x.key === procKeyRef.current)
          : undefined;
        if (auto) {
          // 자동 계산: 고른 공정의 최신 진행률보다 올려 둔 값만 유지
          const prevProc = lastProcBase.current;
          // 사용자가 직전 기준값보다 올려 둔 값만 유지(보고 삭제로 내려간 차이는 버림)
          setValue(prev =>
            p
              ? prev !== null && prev > prevProc && prev > p.progress
                ? Math.min(100, prev)
                : p.progress
              : 0,
          );
          lastProcBase.current = p?.progress ?? 0;
          if (!p) {
            setProcKey(null);
          }
        } else {
          setValue(prev =>
            prev !== null && prev > prevBase && prev > s.overallProgress
              ? Math.min(100, prev)
              : s.overallProgress,
          );
        }
      }
    } catch {
      setLoadError(true);
    }
  }, [siteId, user.id]);

  // 입력이 바뀌면 0.5초 뒤 임시저장(바뀐 게 없으면 삭제)
  useEffect(() => {
    if (!hydrated.current || !site || value === null) {
      return;
    }
    const t = setTimeout(() => {
      const selected = site.processes?.find(x => x.key === procKey);
      const changed =
        site.progressMode === 'auto'
          ? !!selected && value !== selected.progress
          : value !== site.overallProgress;
      if (
        !changed &&
        works.length === 0 &&
        !workText.trim() &&
        !memo.trim() &&
        photos.length === 0 &&
        files.length === 0 &&
        rating === null &&
        !usedRows.some(r => r.name.trim() || r.qty.trim())
      ) {
        draftStore.clear(user.id, siteId);
        return;
      }
      draftStore.save(user.id, siteId, {
        work: joinWorks(works),
        workText,
        processKey: procKey,
        value,
        memo,
        photoUris: photos.map(p => p.uri!),
        photoPhases: photos.map(p => p.phase),
        rating,
        materials: usedRows
          .filter(r => r.name.trim() || r.qty.trim())
          .map(({ name, qty, unit }) => ({ name, qty, unit })),
        files,
        savedAt: new Date().toISOString(),
      });
    }, 500);
    return () => clearTimeout(t);
  }, [
    site,
    value,
    procKey,
    works,
    workText,
    memo,
    photos,
    files,
    rating,
    usedRows,
    user.id,
    siteId,
  ]);

  const discardDraft = async () => {
    const ok = await dialog.confirm({
      title: '새로 작성할까요?',
      message: '작성 중이던 작업, 진행률, 사진, 자재, 첨부, 메모가 지워져요.',
      confirmText: '지우기',
      danger: true,
    });
    if (!ok) {
      return;
    }
    if (site) {
      setValue(site.progressMode === 'auto' ? 0 : site.overallProgress);
      setProcKey(null);
    }
    setWorks([]);
    setWorkText('');
    setMemo('');
    setPhotos([]);
    setUsedRows([emptyMaterialRow()]);
    setRating(null);
    setFiles([]);
    setRestoredAt(null);
    draftStore.clear(user.id, siteId);
  };

  // 엑셀·PDF 등 문서 첨부(앱 안에 사본을 만들어 두어 임시저장 후에도 보낼 수 있게)
  const addFiles = async () => {
    const remaining = MAX_FILES - files.length;
    if (remaining <= 0) {
      dialog.toast(`파일은 최대 ${MAX_FILES}개까지 첨부할 수 있어요`, 'error');
      return;
    }
    let picked;
    try {
      picked = await pickDocuments({
        type: [docTypes.allFiles],
        allowMultiSelection: true,
      });
    } catch {
      return; // 사용자가 닫음
    }
    const ok: PickedFile[] = [];
    const rejected: string[] = [];
    for (const f of picked) {
      const name = f.name ?? '파일';
      const ext = name.includes('.')
        ? name.split('.').pop()!.toLowerCase()
        : '';
      if (!DOC_EXT.includes(ext)) {
        rejected.push(`${name} (지원하지 않는 형식)`);
      } else if ((f.size ?? 0) > MAX_FILE_MB * 1024 * 1024) {
        rejected.push(`${name} (${MAX_FILE_MB}MB 초과)`);
      } else {
        ok.push({ uri: f.uri, name, type: f.type, size: f.size });
      }
    }
    const chosen = ok.slice(0, remaining);
    if (chosen.length > 0) {
      const copies = await keepLocalCopy({
        files: chosen.map(f => ({ uri: f.uri, fileName: f.name })) as [
          { uri: string; fileName: string },
          ...{ uri: string; fileName: string }[],
        ],
        destination: 'cachesDirectory',
      });
      const withLocal = chosen.map((f, i) => {
        const c = copies[i];
        return c && c.status === 'success' ? { ...f, uri: c.localUri } : f;
      });
      setFiles(prev => [...prev, ...withLocal]);
    }
    if (rejected.length > 0 || ok.length > chosen.length) {
      dialog.notice({
        icon: 'warning',
        title: '첨부하지 못한 파일이 있어요',
        message:
          [
            ...rejected,
            ...(ok.length > chosen.length
              ? [
                  `최대 ${MAX_FILES}개까지라 ${
                    ok.length - chosen.length
                  }개는 빠졌어요`,
                ]
              : []),
          ].join('\n') +
          '\n\n엑셀·PDF·한글·워드·PPT 파일을 20MB까지 올릴 수 있어요.',
      });
    }
  };

  const removeFile = (uri: string) =>
    setFiles(prev => prev.filter(f => f.uri !== uri));

  // 다른 화면(코드 재발급 등)에서 돌아올 때마다 현장 정보 새로고침
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const addPhotos = (res: ImagePickerResponse, phase: PhotoPhase) => {
    if (res.didCancel) {
      return;
    }
    if (res.errorCode) {
      dialog.notice({
        icon: 'danger',
        title: '사진을 가져오지 못했어요',
        message: res.errorMessage ?? res.errorCode,
      });
      return;
    }
    const picked = (res.assets ?? []).filter(a => a.uri);
    setPhotos(prev => [
      ...prev,
      ...picked
        .filter(a => !prev.some(p => p.uri === a.uri))
        .map(a => ({ ...a, phase })),
    ]);
  };

  const openPhotoMenu = async (phase: PhotoPhase) => {
    const label = phase === 'before' ? '작업 전' : '작업 후';
    const options = {
      mediaType: 'photo' as const,
      quality: 0.7 as const,
      maxWidth: 1600,
      maxHeight: 1600,
      includeExtra: true, // 원본 사진의 촬영 시각(timestamp)을 함께 받는다
    };
    const pick = await dialog.choose({
      title: `${label} 사진 추가`,
      message:
        phase === 'before'
          ? '작업하기 전 현장 모습을 올려 주세요'
          : '작업을 마친 뒤 모습을 올려 주세요',
      options: [
        {
          label: '카메라로 촬영',
          description: '지금 현장을 바로 찍어요',
          icon: <Camera {...ICON} />,
          value: 'camera' as const,
        },
        {
          label: '앨범에서 선택',
          description: '여러 장을 한 번에 고를 수 있어요',
          icon: <Images {...ICON} />,
          value: 'library' as const,
        },
      ],
    });
    if (pick === 'camera') {
      // 카메라로 찍은 사진은 지금이 촬영 시각
      launchCamera({ ...options, saveToPhotos: false }).then(res =>
        addPhotos(
          {
            ...res,
            assets: res.assets?.map(a => ({
              ...a,
              timestamp: a.timestamp ?? new Date().toISOString(),
            })),
          },
          phase,
        ),
      );
    } else if (pick === 'library') {
      // selectionLimit 0 = 개수 제한 없이 고르기
      launchImageLibrary({ ...options, selectionLimit: 0 }).then(res =>
        addPhotos(res, phase),
      );
    }
  };

  const removePhoto = async (uri?: string) => {
    const ok = await dialog.confirm({
      title: '사진을 뺄까요?',
      message: '이 보고에서만 빠지고, 폰 앨범의 사진은 그대로 있어요.',
      confirmText: '빼기',
      danger: true,
    });
    if (ok) {
      setPhotos(prev => prev.filter(p => p.uri !== uri));
    }
  };

  if (!site || value === null) {
    return (
      <View style={styles.root}>
        <AppHeader title="" onBack={() => navigation.goBack()} />
        <View style={styles.center}>
          {loadError ? (
            <>
              <Text style={styles.loadError}>
                현장 정보를 불러오지 못했어요.
              </Text>
              <Button title="다시 시도" onPress={load} style={styles.retry} />
            </>
          ) : (
            <ActivityIndicator color={colors.navy} size="large" />
          )}
        </View>
      </View>
    );
  }

  // 자동 계산 현장: 공정을 골라 그 공정의 진행률을 적는다(전체는 가중치로 계산)
  const isAuto =
    site.progressMode === 'auto' && (site.processes?.length ?? 0) > 0;
  const proc = isAuto
    ? site.processes!.find(x => x.key === procKey) ?? null
    : null;
  // 마지막 보고 값(직접 입력: 현장 전체, 자동 계산: 고른 공정)
  const base = isAuto ? proc?.progress ?? 0 : site.overallProgress;
  const lastAt = isAuto ? proc?.lastReportedAt ?? null : site.lastReportedAt;
  const baseLabel = !lastAt
    ? '시작'
    : isToday(lastAt)
    ? '직전 보고'
    : `${new Date(lastAt).getMonth() + 1}/${new Date(lastAt).getDate()} 보고`;
  const today = value;
  const added = round1(today - base);
  // 이번 보고 후 현장 전체 진행률(자동 계산이면 미리 계산해서 보여 준다)
  const overallAfter =
    isAuto && proc
      ? Math.max(
          site.overallProgress,
          weightedAfter(site.processes!, proc.key, today),
        )
      : today;
  const pickProcess = (key: string) => {
    const p = site.processes?.find(x => x.key === key);
    setProcKey(key);
    setValue(p?.progress ?? 0);
    lastProcBase.current = p?.progress ?? 0;
    setValueText(null);
  };

  // 마지막 보고 값 아래로, 100% 위로는 못 가게 제한
  const clamp = (v: number) => round1(Math.min(100, Math.max(base, v)));
  const change = (delta: number) => setValue(clamp(today + delta));
  const commitValueText = () => {
    if (valueText !== null) {
      const n = Number(valueText.replace(',', '.'));
      if (Number.isFinite(n)) {
        setValue(clamp(n));
        if (n < base) {
          dialog.toast(
            `${proc ? proc.name : '지금'} 진행률(${pct(
              base,
            )})보다 낮게는 못 적어요`,
            'error',
          );
        }
      }
      setValueText(null);
    }
  };

  const workFull = () =>
    dialog.toast('진행한 작업은 모두 합쳐 100자까지 넣을 수 있어요', 'error');

  // 보고 제출 버튼: 진행한 작업은 꼭 하나 이상. 입력하다 만 글자도 태그로 넣는다
  const openSubmit = () => {
    const next = addWork(works, workText);
    if (next === null) {
      workFull();
      return;
    }
    setWorks(next);
    setWorkText('');
    if (isAuto && !proc) {
      dialog.toast('보고할 공정을 골라 주세요', 'error');
      return;
    }
    if (!isAuto && next.length === 0) {
      dialog.toast('진행한 작업을 적어 주세요', 'error');
      return;
    }
    if (usedBad) {
      dialog.toast(`${usedBad}의 사용량을 입력해 주세요`, 'error');
      return;
    }
    setSheetOpen(true);
  };
  const work = joinWorks(works);
  // 오늘 사용한 자재(이름이 있는 줄만)
  const { items: usedItems, bad: usedBad } = itemsFromRows(usedRows);
  // 현장 관리자만 평점을 매긴다
  const isSiteOwner = site.ownerId === user.id;
  const setRatingClamped = (v: number) =>
    setRating(round1(Math.min(RATING_MAX, Math.max(RATING_MIN, v))));
  // 별을 누르면 1점 단위, 같은 점수의 별을 한 번 더 누르면 0.5점 빼기
  const tapStar = (n: number) => setRating(prev => (prev === n ? n - 0.5 : n));
  // 제출 확인 시트에 보이는 작업(자동 계산이면 공정 진행률 변화를 맨 앞에)
  const sheetWork = proc
    ? joinWorks([`${proc.name} ${pct(base)} → ${pct(today)}`, ...works])
    : work;

  const handleSubmit = async () => {
    setSubmitting(true);
    // 입력칸을 비우기 전에 완료 안내에 쓸 값 기억
    const submittedPhotos = photos.length;
    const submittedFiles = files.length;
    const submittedMemo = !!memo.trim();
    try {
      // 제출 위치(휴대폰 GPS). 위치 권한을 안 주면 위치 없이 제출
      const place = await currentPlace();
      const created = await submitReport({
        siteId: site.id,
        work,
        to: today,
        processKey: proc?.key,
        processTo: proc ? today : undefined,
        photoUris: photos.map(p => p.uri!),
        photoTakenAt: photos.map(p => p.timestamp ?? null),
        photoPhases: photos.map(p => p.phase),
        rating: isSiteOwner ? rating : null,
        materials: usedItems,
        location: place,
        files,
        memo: memo.trim(),
        workLog: EMPTY_WORKLOG, // 날씨·인원·장비는 받지 않는다
      });
      // 제출 성공: 화면의 기준값을 바로 제출한 값으로(새로고침이 실패해도 중복 제출 안 되게)
      const submittedWork = proc
        ? [`${proc.name} ${pct(base)} → ${pct(today)}`, ...works].join('\n')
        : works.join(', ');
      const overallFrom = isAuto ? site.overallProgress : base;
      const now = new Date().toISOString();
      // 진행률은 승인된 순간부터 오른다(바로 승인되는 보고만 화면에 바로 반영)
      const approved =
        created.review?.status !== 'pending' &&
        created.review?.status !== 'revision';
      if (approved) {
        setSite({
          ...site,
          overallProgress: overallAfter,
          lastReportedAt: now,
          processes: site.processes?.map(x =>
            x.key === proc?.key
              ? { ...x, progress: today, lastReportedAt: now }
              : x,
          ),
        });
        setValue(today);
        lastBase.current = overallAfter;
        lastProcBase.current = today;
      } else {
        setSite({ ...site, lastReportedAt: now });
      }
      const submittedUsed = usedItems.length;
      const submittedRating = isSiteOwner ? rating : null;
      fetchSite(site.id)
        .then(updated => {
          setSite(updated);
          const p = updated.processes?.find(x => x.key === procKeyRef.current);
          setValue(
            updated.progressMode === 'auto'
              ? p?.progress ?? 0
              : updated.overallProgress,
          );
          lastBase.current = updated.overallProgress;
        })
        .catch(() => {});
      setWorks([]);
      setWorkText('');
      setPhotos([]);
      setUsedRows([emptyMaterialRow()]);
      setRating(null);
      setFiles([]);
      setMemo('');
      setRestoredAt(null);
      draftStore.clear(user.id, site.id);
      setSheetOpen(false);
      const next = await dialog.show({
        icon: 'success',
        title: '보고를 제출했어요',
        message:
          `${submittedWork}\n${approved ? '' : '승인되면 '}${
            isAuto ? '현장 전체 ' : ''
          }진행률 ${pct(overallFrom)} → ${pct(overallAfter)} (+${round1(
            overallAfter - overallFrom,
          ).toFixed(1)}%p)\n` +
          `사진 ${submittedPhotos}장` +
          (submittedUsed ? ` · 사용 자재 ${submittedUsed}가지` : '') +
          (submittedFiles ? ` · 파일 ${submittedFiles}개` : '') +
          (submittedMemo ? ' · 메모 포함' : '') +
          (submittedRating != null
            ? ` · 평점 ${submittedRating.toFixed(1)}점`
            : '') +
          (approved ? '' : '\n관리자가 승인하면 진행률에 반영돼요.'),
        actions: [
          { label: '이력 보기', value: 'history', variant: 'secondary' },
          { label: '확인', value: 'ok', variant: 'primary' },
        ],
      });
      if (next === 'history') {
        navigation.navigate('History', {
          siteId: site.id,
          siteName: site.name,
        });
      }
    } catch (e) {
      dialog.notice({
        icon: 'danger',
        title: '제출하지 못했어요',
        message: errorMessage(e),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const reportedToday = isToday(site.lastReportedAt);
  const isOwner = site.ownerId === user.id;
  const goProgress = () =>
    navigation.navigate('Progress', { siteId: site.id, siteName: site.name });
  const goMaterials = () =>
    navigation.navigate('Materials', { siteId: site.id, siteName: site.name });
  const newMaterialRequest = () =>
    navigation.navigate('MaterialRequest', {
      siteId: site.id,
      siteName: site.name,
    });
  // 관리자: 내가 승인·반려할 요청 / 작업자: 내 요청 중 승인 대기
  const waitingMaterials = materials.filter(m => m.canApprove).length;
  const myOpenMaterials = materials.filter(
    m => m.authorId === user.id && m.status === 'requested',
  ).length;
  const materialStatusText = isOwner
    ? waitingMaterials > 0
      ? `처리할 요청 ${waitingMaterials}건`
      : site.hqName
      ? `${site.hqName}에 연결됨`
      : '처리할 요청이 없어요'
    : myOpenMaterials > 0
    ? `내 요청 승인 대기 ${myOpenMaterials}건`
    : '부족한 자재를 관리자에게 바로 요청해요';
  const canMinus = today > base;
  const canPlus = today < 100;

  return (
    <View style={styles.root}>
      <AppHeader
        title={site.name}
        subtitle={`${formatDate()} · ${
          site.ownerId === user.id ? '관리자' : '작업자로 참여'
        }`}
        onBack={() => navigation.goBack()}
        right={
          <IconButton label="메뉴" onPress={() => setMenuOpen(true)}>
            <Menu size={22} color={colors.text} strokeWidth={2} />
          </IconButton>
        }
      />

      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {restoredAt ? (
            <View style={styles.restored}>
              <Text style={styles.restoredText}>
                {formatTime(restoredAt)}에 작성 중이던 내용을 불러왔어요
              </Text>
              <Pressable hitSlop={8} onPress={discardDraft}>
                <Text style={styles.restoredLink}>새로 쓰기</Text>
              </Pressable>
            </View>
          ) : null}

          {/* 전체 진행률 */}
          <Card style={styles.hero}>
            <View style={styles.ringRow}>
              <ProgressRing value={site.overallProgress} />
              <View style={styles.ringSide}>
                <Text style={styles.label}>현장 전체 진행률</Text>
                {site.workType ? (
                  <Text style={styles.workTypeText} numberOfLines={2}>
                    {site.workType}
                  </Text>
                ) : null}
                <Text style={styles.todayCount}>
                  {reportedToday ? '오늘 보고 있음' : '오늘 아직 보고 없음'}
                </Text>
                {isAuto ? (
                  <Text style={styles.autoBadge}>공정 가중치로 자동 계산</Text>
                ) : null}
                <Pressable
                  style={styles.ringLink}
                  onPress={goProgress}
                  hitSlop={6}
                >
                  <Text style={styles.planLinkText}>진척 현황</Text>
                  <ChevronRight size={16} color={colors.white} />
                </Pressable>
              </View>
            </View>
          </Card>

          {/* 자동 계산: 보고할 공정 고르기 */}
          {isAuto ? (
            <Card style={styles.gap}>
              <Text style={styles.cardTitleInline}>보고할 공정</Text>
              <Text style={styles.valueHint}>
                오늘 작업한 공정을 골라 주세요. 괄호는 가중치예요.
              </Text>
              <View style={styles.procList}>
                {site.processes!.map(p => {
                  const on = p.key === procKey;
                  return (
                    <Pressable
                      key={p.key}
                      style={[styles.procRow, on && styles.procRowOn]}
                      onPress={() => pickProcess(p.key)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                    >
                      <View style={styles.flex}>
                        <Text
                          style={[styles.procName, on && styles.procNameOn]}
                        >
                          {p.name}{' '}
                          <Text style={styles.procWeight}>({p.weight}%)</Text>
                        </Text>
                        <View style={styles.procTrack}>
                          <View
                            style={[
                              styles.procFill,
                              { width: `${p.progress}%` },
                            ]}
                          />
                        </View>
                      </View>
                      <Text style={[styles.procPct, on && styles.procNameOn]}>
                        {pct(p.progress)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </Card>
          ) : null}

          {/* 진행한 작업 */}
          <Card style={styles.gap}>
            <View style={styles.fileTitleRow}>
              <Text style={styles.cardTitleInline}>
                진행한 작업{isAuto ? ' (선택)' : ''}
              </Text>
              <Text style={styles.fileCount}>{works.length}개</Text>
            </View>
            <WorkTagInput
              tags={works}
              onChange={setWorks}
              text={workText}
              onChangeText={setWorkText}
              onFull={workFull}
            />
            <Text style={styles.hint}>
              입력하고 완료(↵)를 누르면 한 줄씩 추가돼요.
            </Text>
          </Card>

          {/* 진행률(직접 입력: 현장 전체 / 자동 계산: 고른 공정) */}
          <Card style={styles.gap}>
            <Text style={styles.cardTitleInline}>
              {isAuto ? `${proc?.name ?? '공정'} 진행률` : '현장 전체 진행률'}
            </Text>
            <Text style={styles.valueHint}>
              {isAuto
                ? '공정 진행률을 적으면 전체 진행률은 자동으로 계산돼요'
                : '공사 전체가 얼마나 진행됐는지 직접 판단해서 적어 주세요'}
            </Text>

            {isAuto && !proc ? (
              <Text style={styles.pickFirst}>
                위에서 보고할 공정을 먼저 골라 주세요
              </Text>
            ) : (
              <>
                <View style={styles.progressTop}>
                  <View>
                    <View style={styles.valueRow}>
                      <TextInput
                        style={styles.progressValue}
                        value={valueText ?? today.toFixed(1)}
                        onFocus={() => setValueText(String(today))}
                        onChangeText={t =>
                          setValueText(t.replace(/[^0-9.,]/g, '').slice(0, 5))
                        }
                        onBlur={commitValueText}
                        onSubmitEditing={commitValueText}
                        keyboardType="decimal-pad"
                        selectTextOnFocus
                        accessibilityLabel={
                          isAuto
                            ? `${proc?.name ?? '공정'} 진행률 입력`
                            : '현장 전체 진행률 직접 입력'
                        }
                      />
                      <Text style={styles.progressUnit}>%</Text>
                    </View>
                    <Text style={styles.progressSub}>
                      {baseLabel} {base.toFixed(1)}%
                      {added > 0 ? (
                        <Text style={styles.addedText}>
                          {'  '}+{added.toFixed(1)}%p
                        </Text>
                      ) : null}
                    </Text>
                  </View>
                  <View style={styles.stepper}>
                    <Pressable
                      accessibilityLabel="1%p 내리기"
                      style={[styles.stepBtn, !canMinus && styles.disabled]}
                      onPress={() => change(-STEP)}
                      disabled={!canMinus}
                    >
                      <Minus {...ICON} />
                    </Pressable>
                    <Pressable
                      accessibilityLabel="1%p 올리기"
                      style={[styles.stepBtn, !canPlus && styles.disabled]}
                      onPress={() => change(STEP)}
                      disabled={!canPlus}
                    >
                      <Plus {...ICON} />
                    </Pressable>
                  </View>
                </View>

                <View style={styles.track}>
                  <View style={[styles.fillBase, { width: `${base}%` }]} />
                  <View style={[styles.fillToday, { width: `${added}%` }]} />
                </View>
                <View style={styles.legend}>
                  <View style={[styles.dot, styles.dotBase]} />
                  <Text style={styles.legendText}>누적</Text>
                  <View style={[styles.dot, styles.dotToday]} />
                  <Text style={styles.legendText}>오늘 작업분</Text>
                </View>
                {/* 빨리 올리기 */}
                <View style={styles.quickRow}>
                  {[5, 10].map(n => (
                    <Pressable
                      key={n}
                      style={[styles.quickBtn, today >= 100 && styles.disabled]}
                      onPress={() => change(n)}
                      disabled={today >= 100}
                    >
                      <Text style={styles.quickText}>+{n}%p</Text>
                    </Pressable>
                  ))}
                  <Pressable
                    style={[styles.quickBtn, added <= 0 && styles.disabled]}
                    onPress={() => setValue(base)}
                    disabled={added <= 0}
                  >
                    <Text style={styles.quickText}>처음 값으로</Text>
                  </Pressable>
                </View>
                {isAuto && proc ? (
                  <View style={styles.autoPreview}>
                    <Text style={styles.autoPreviewLabel}>
                      현장 전체 진행률 (자동 계산)
                    </Text>
                    <Text style={styles.autoPreviewValue}>
                      {pct(site.overallProgress)} →{' '}
                      <Text style={styles.autoPreviewTo}>
                        {pct(overallAfter)}
                      </Text>
                    </Text>
                  </View>
                ) : null}
              </>
            )}
          </Card>

          {/* 현장 사진: 위는 작업 전, 아래는 작업 후 */}
          <Card style={styles.gap}>
            <Text style={styles.cardTitle}>현장 사진</Text>
            {PHASES.map(({ phase, label }) => {
              const list = photos.filter(p => p.phase === phase);
              return (
                <View
                  key={phase}
                  style={phase === 'after' ? styles.phaseAfter : undefined}
                >
                  <View style={styles.phaseHead}>
                    <Text style={styles.phaseLabel}>{label}</Text>
                    <Text style={styles.fileCount}>{list.length}장</Text>
                  </View>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.photoRow}
                  >
                    <Pressable
                      accessibilityLabel={`${label} 사진 추가`}
                      style={({ pressed }) => [
                        styles.addPhoto,
                        pressed && styles.addPhotoPressed,
                      ]}
                      onPress={() => openPhotoMenu(phase)}
                    >
                      <Camera
                        size={24}
                        color={colors.textSub}
                        strokeWidth={1.8}
                      />
                      <Text style={styles.addPhotoCount}>
                        <Text
                          style={list.length > 0 ? styles.countOn : undefined}
                        >
                          {list.length}
                        </Text>
                        장
                      </Text>
                    </Pressable>
                    {list.map((p, i) => (
                      <Pressable
                        key={p.uri}
                        style={styles.thumb}
                        onPress={() => setViewing(photos.indexOf(p))}
                        accessibilityLabel={`${label} 사진 ${i + 1} 크게 보기`}
                      >
                        <Image
                          source={{ uri: p.uri }}
                          style={styles.thumbImage}
                        />
                        <Pressable
                          style={styles.thumbRemove}
                          onPress={() => removePhoto(p.uri)}
                          hitSlop={8}
                          accessibilityLabel={`${label} 사진 ${i + 1} 삭제`}
                        >
                          <X size={12} color={colors.white} strokeWidth={3} />
                        </Pressable>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              );
            })}
            {photos.length === 0 ? (
              <Text style={styles.hint}>
                작업 전과 작업 후 모습을 사진으로 남겨 주세요.
              </Text>
            ) : null}
          </Card>

          {/* 오늘 사용한 자재: 승인되면 현장 자재 재고에서 빠진다 */}
          <Card style={styles.gap}>
            <View style={styles.fileTitleRow}>
              <Text style={styles.cardTitleInline}>
                오늘 사용한 자재 (선택)
              </Text>
              <Text style={styles.fileCount}>{usedItems.length}가지</Text>
            </View>
            <MaterialRowsEditor
              rows={usedRows}
              onChange={setUsedRows}
              presets={(site.materials ?? []).map(m => ({
                name: m.name,
                unit: m.unit,
                note: `${formatQty(m.quantity)}${m.unit} 남음`,
              }))}
              presetLabel="현장 자재(남은 양)"
              onFull={() =>
                dialog.toast('자재는 50가지까지 넣을 수 있어요', 'error')
              }
            />
            <Text style={styles.hint}>
              보고가 승인되면 사용한 양만큼 현장 자재에서 빠져요.
            </Text>
          </Card>

          {/* 첨부 파일(엑셀·PDF 등) */}
          <Card style={styles.gap}>
            <View style={styles.fileTitleRow}>
              <Text style={styles.cardTitleInline}>첨부 파일</Text>
              <Text style={styles.fileCount}>
                {files.length}/{MAX_FILES}
              </Text>
            </View>
            {files.map(f => (
              <View key={f.uri} style={styles.fileRow}>
                <FileText size={20} color={colors.textSub} />
                <View style={styles.flex}>
                  <Text style={styles.fileName} numberOfLines={1}>
                    {f.name}
                  </Text>
                  {f.size ? (
                    <Text style={styles.fileMeta}>{fileSize(f.size)}</Text>
                  ) : null}
                </View>
                <Pressable
                  hitSlop={8}
                  onPress={() => removeFile(f.uri)}
                  accessibilityLabel={`${f.name} 빼기`}
                >
                  <X size={18} color={colors.textMuted} />
                </Pressable>
              </View>
            ))}
            <Pressable
              style={({ pressed }) => [
                styles.fileAdd,
                pressed && styles.addPhotoPressed,
                files.length >= MAX_FILES && styles.disabled,
              ]}
              onPress={addFiles}
            >
              <Paperclip size={18} color={colors.text} />
              <Text style={styles.fileAddText}>파일 첨부</Text>
            </Pressable>
            <Text style={styles.hint}>
              엑셀·PDF·한글·워드·파워포인트 파일, 한 개당 20MB까지
            </Text>
          </Card>

          {/* 오늘 작업 평점(현장 관리자만) */}
          {isSiteOwner ? (
            <Card style={styles.gap}>
              <View style={styles.fileTitleRow}>
                <Text style={styles.cardTitleInline}>
                  오늘 작업 평점 (선택)
                </Text>
                {rating !== null ? (
                  <Pressable hitSlop={8} onPress={() => setRating(null)}>
                    <Text style={styles.restoredLink}>지우기</Text>
                  </Pressable>
                ) : null}
              </View>
              <View style={styles.progressTop}>
                <View style={styles.stars}>
                  {[1, 2, 3, 4, 5].map(n => {
                    const fill = Math.max(
                      0,
                      Math.min(1, (rating ?? 0) - (n - 1)),
                    );
                    return (
                      <Pressable
                        key={n}
                        onPress={() => tapStar(n)}
                        hitSlop={4}
                        accessibilityLabel={`${n}점`}
                      >
                        <Star
                          size={STAR_SIZE}
                          color={colors.yellow}
                          strokeWidth={1.8}
                        />
                        {fill > 0 ? (
                          <View
                            style={[
                              styles.starFill,
                              { width: STAR_SIZE * fill },
                            ]}
                          >
                            <Star
                              size={STAR_SIZE}
                              color={colors.yellow}
                              fill={colors.yellow}
                              strokeWidth={1.8}
                            />
                          </View>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
                <View style={styles.stepper}>
                  <Pressable
                    accessibilityLabel="평점 0.1점 내리기"
                    style={[
                      styles.stepBtn,
                      (rating ?? 0) <= RATING_MIN && styles.disabled,
                    ]}
                    onPress={() =>
                      setRatingClamped((rating ?? RATING_MIN) - 0.1)
                    }
                    disabled={(rating ?? 0) <= RATING_MIN}
                  >
                    <Minus {...ICON} />
                  </Pressable>
                  <Pressable
                    accessibilityLabel="평점 0.1점 올리기"
                    style={[
                      styles.stepBtn,
                      (rating ?? 0) >= RATING_MAX && styles.disabled,
                    ]}
                    onPress={() =>
                      setRatingClamped(
                        rating === null ? RATING_MIN : rating + 0.1,
                      )
                    }
                    disabled={(rating ?? 0) >= RATING_MAX}
                  >
                    <Plus {...ICON} />
                  </Pressable>
                </View>
              </View>
              <Text style={styles.ratingValue}>
                {rating === null
                  ? '아직 안 매겼어요'
                  : `${rating.toFixed(1)}점`}
                <Text style={styles.ratingMax}> / 5.0</Text>
              </Text>
              <Text style={styles.hint}>
                별을 누르면 1점씩, 같은 별을 한 번 더 누르면 0.5점이 빠져요. −/+
                버튼으로 0.1점씩 바꿀 수 있어요.
              </Text>
            </Card>
          ) : null}

          {/* 작업 메모 */}
          <Card style={styles.gap}>
            <Text style={styles.cardTitle}>작업 메모</Text>
            <TextInput
              style={[styles.memo, memoFocused && styles.memoFocused]}
              value={memo}
              onChangeText={setMemo}
              onFocus={() => setMemoFocused(true)}
              onBlur={() => setMemoFocused(false)}
              placeholder="오늘 작업 내용, 특이사항을 입력하세요"
              placeholderTextColor={colors.textMuted}
              multiline
              textAlignVertical="top"
            />
          </Card>

          {/* 자재 요청 */}
          <Card style={styles.gap}>
            <Pressable
              style={styles.materialRow}
              onPress={goMaterials}
              hitSlop={4}
            >
              <View style={styles.materialIcon}>
                <Package size={20} color={colors.text} strokeWidth={2} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.materialTitle}>자재 요청</Text>
                <Text
                  style={[
                    styles.materialSub,
                    isOwner && waitingMaterials > 0 && styles.materialSubOn,
                  ]}
                >
                  {materialStatusText}
                </Text>
              </View>
              <ChevronRight size={18} color={colors.textMuted} />
            </Pressable>
            <Button
              title="자재 요청하기"
              variant="outline"
              onPress={newMaterialRequest}
              style={styles.materialBtn}
            />
          </Card>
        </ScrollView>

        <BottomBar>
          <Button title="보고 제출" onPress={openSubmit} />
        </BottomBar>
      </KeyboardAvoidingView>

      <SubmitSheet
        visible={sheetOpen}
        siteName={site.name}
        work={sheetWork}
        from={isAuto ? site.overallProgress : base}
        to={overallAfter}
        photoCount={photos.length}
        fileCount={files.length}
        memo={memo}
        submitting={submitting}
        onClose={() => setSheetOpen(false)}
        onSubmit={handleSubmit}
      />

      <PhotoViewer
        uris={photos.map(p => p.uri!)}
        index={viewing}
        onClose={() => setViewing(null)}
      />

      <MenuSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        items={[
          {
            icon: <TrendingUp {...ICON} />,
            label: '진척 현황',
            onPress: goProgress,
          },
          {
            icon: <ClipboardList {...ICON} />,
            label: '보고 이력',
            onPress: () =>
              navigation.navigate('History', {
                siteId: site.id,
                siteName: site.name,
              }),
          },
          {
            icon: <Package {...ICON} />,
            label: '자재 요청',
            description:
              waitingMaterials > 0 ? `처리 ${waitingMaterials}건` : undefined,
            onPress: goMaterials,
          },
          {
            icon: <Users {...ICON} />,
            label: '참여자',
            description: `${site.memberCount}명`,
            onPress: () =>
              navigation.navigate('Members', {
                siteId: site.id,
                siteName: site.name,
                isOwner: site.ownerId === user.id,
              }),
          },
          // 참여 코드는 이 현장의 관리자에게만 내려온다
          ...(site.code
            ? [
                {
                  icon: <KeyRound {...ICON} />,
                  label: '참여 코드',
                  description: site.code,
                  onPress: () =>
                    navigation.navigate('SiteCode', {
                      siteId: site.id,
                      siteName: site.name,
                      code: site.code!,
                    }),
                },
                {
                  icon: <Settings {...ICON} />,
                  label: '현장 설정',
                  onPress: () =>
                    navigation.navigate('SiteSettings', { siteId: site.id }),
                },
              ]
            : []),
          {
            icon: <Building2 {...ICON} />,
            label: '현장 목록',
            onPress: () => navigation.popTo('Sites'),
          },
          {
            icon: <LogOut {...ICON} color={colors.danger} />,
            label: '로그아웃',
            danger: true,
            onPress: async () => {
              const ok = await dialog.confirm({
                title: '로그아웃할까요?',
                message: '다시 로그인하면 참여한 현장을 그대로 볼 수 있어요.',
                confirmText: '로그아웃',
              });
              if (ok) {
                logout();
              }
            },
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadError: { fontSize: 15, color: colors.text, marginBottom: 12 },
  retry: { paddingHorizontal: 28 },

  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24 },
  gap: { marginTop: 12 },
  label: { fontSize: 14, color: '#A9B0C0' },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 14,
  },
  hint: { fontSize: 13, color: colors.textMuted, marginTop: 10 },

  // 임시저장 안내
  restored: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.yellowSoft,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
  },
  restoredText: { flex: 1, fontSize: 13, color: '#8A5E00' },
  restoredLink: { fontSize: 13, fontWeight: '700', color: '#8A5E00' },
  todayCount: { color: colors.white, fontWeight: '600' },

  // 전체 진행률(남색 카드)
  hero: { backgroundColor: colors.navy },
  workTypeText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.white,
    marginTop: 4,
  },
  workInput: {
    minHeight: 72,
    borderRadius: radius.md,
    backgroundColor: colors.fill,
    padding: 14,
    fontSize: 16,
    lineHeight: 23,
    color: colors.text,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  valueHint: {
    fontSize: 13,
    color: colors.textSub,
    marginTop: 4,
    marginBottom: 6,
  },
  valueRow: { flexDirection: 'row', alignItems: 'baseline' },
  progressUnit: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    marginLeft: 2,
  },
  quickRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  quickBtn: {
    paddingHorizontal: 14,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
  },
  quickText: { fontSize: 14, fontWeight: '600', color: colors.text },

  ringRow: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  ringSide: { flex: 1, gap: 6 },
  ringLink: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  planLink: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
  },
  planLinkText: { fontSize: 13, fontWeight: '600', color: colors.white },

  // 첨부 파일
  fileTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  cardTitleInline: { fontSize: 16, fontWeight: '700', color: colors.text },
  fileCount: { fontSize: 13, color: colors.textMuted },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.fill,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  fileName: { fontSize: 14, fontWeight: '600', color: colors.text },
  fileMeta: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
  fileAdd: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  fileAddText: { fontSize: 15, fontWeight: '600', color: colors.text },

  segmentActive: {
    backgroundColor: colors.white,
    elevation: 1,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
  },

  // 공정 진행률
  progressTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 20,
  },
  // 숫자를 눌러 바로 고칠 수 있다(밑줄로 입력칸임을 알림)
  progressValue: {
    fontSize: 30,
    fontWeight: '800',
    color: colors.text,
    padding: 0,
    minWidth: 64,
    borderBottomWidth: 2,
    borderBottomColor: colors.border,
  },
  progressSub: { fontSize: 13, color: colors.textSub, marginTop: 2 },
  addedText: { fontWeight: '700', color: '#B7800A' },
  stepper: { flexDirection: 'row', gap: 8 },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.35 },
  track: {
    flexDirection: 'row',
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.track,
    overflow: 'hidden',
    marginTop: 16,
  },
  fillBase: { height: '100%', backgroundColor: colors.navy },
  fillToday: { height: '100%', backgroundColor: colors.yellow },
  legend: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 5 },
  dotBase: { backgroundColor: colors.navy },
  dotToday: { backgroundColor: colors.yellow, marginLeft: 12 },
  legendText: { fontSize: 12, color: colors.textSub },

  // 사진
  photoRow: { gap: 8 },
  phaseHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  phaseLabel: { fontSize: 14, fontWeight: '600', color: colors.textSub },
  phaseAfter: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  stars: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  starFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    height: STAR_SIZE,
    overflow: 'hidden',
  },
  ratingValue: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    marginTop: 10,
  },
  ratingMax: { fontSize: 14, fontWeight: '500', color: colors.textMuted },
  addPhoto: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  addPhotoPressed: { backgroundColor: colors.fill },
  addPhotoCount: { fontSize: 12, color: colors.textMuted },
  countOn: { color: colors.text, fontWeight: '600' },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.track,
  },
  thumbImage: { width: '100%', height: '100%' },
  thumbRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(18,23,34,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // 메모
  memo: {
    minHeight: 110,
    backgroundColor: colors.fill,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.fill,
    padding: 14,
    fontSize: 15,
    lineHeight: 22,
    color: colors.text,
  },
  memoFocused: { backgroundColor: colors.white, borderColor: colors.navy },

  // 자동 계산(공정 가중치)
  autoBadge: {
    fontSize: 12,
    color: colors.yellow,
    fontWeight: '700',
    marginTop: 4,
  },
  procList: { gap: 8, marginTop: 12 },
  procRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  procRowOn: { borderColor: colors.navy, backgroundColor: colors.fill },
  procName: { fontSize: 15, fontWeight: '600', color: colors.textSub },
  procNameOn: { color: colors.text, fontWeight: '700' },
  procWeight: { fontSize: 12, color: colors.textMuted, fontWeight: '400' },
  procTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.track,
    marginTop: 8,
    overflow: 'hidden',
  },
  procFill: { height: 4, backgroundColor: colors.navy },
  procPct: { fontSize: 14, color: colors.textSub, fontWeight: '600' },
  pickFirst: {
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: 24,
  },
  autoPreview: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  autoPreviewLabel: { fontSize: 13, color: colors.textSub },
  autoPreviewValue: { fontSize: 15, color: colors.textSub, fontWeight: '600' },
  autoPreviewTo: { color: colors.text, fontWeight: '800' },

  // 자재 요청
  materialRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  materialIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.fill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  materialTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  materialSub: { fontSize: 13, color: colors.textSub, marginTop: 2 },
  materialSubOn: { color: '#B7800A', fontWeight: '600' },
  materialBtn: { marginTop: 16, height: 48 },
});
