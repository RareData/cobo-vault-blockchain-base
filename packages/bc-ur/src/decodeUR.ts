import { sha256Hash } from './utils';
import { decodeSimpleCBOR } from './miniCbor';
import { decodeBc32Data } from '@cvbb/bc-bech32';

const checkAndGetSequence = (sequence: string): [number, number] => {
    const pieces = sequence.toUpperCase().split('OF');
    if (pieces.length !== 2) throw new Error(`invalid sequence: ${sequence}`);
    const [index, total] = pieces;
    return [+index, +total];
};

const checkDigest = (digest: string, payload: string) => {
    const decoded = decodeBc32Data(payload);
    if (!decoded) throw new Error(`can not decode payload: ${payload}`);
    if (decodeBc32Data(digest) !== sha256Hash(Buffer.from(decoded, 'hex')).toString('hex')) {
        throw new Error(`invalid digest: \n digest:${digest} \n payload:${payload}`);
    }
};

const checkURHeader = (UR: string, type = 'bytes') => {
    if (UR.toUpperCase() !== `ur:${type}`.toUpperCase()) throw new Error(`invalid UR header: ${UR}`);
};

const dealWithSingleWorkload = (workload: string, type = 'bytes'): string => {
    const pieces = workload.split('/');
    switch (pieces.length) {
        case 2: {
            //UR:Type/[Fragment]
            checkURHeader(pieces[0], type);
            return pieces[1];
        }
        case 3: {
            //UR:Type/[Digest]/[Fragment] when Sequencing is omitted, Digest MAY be omitted;
            //should check digest
            checkURHeader(pieces[0], type);
            const digest = pieces[1];
            const fragment = pieces[2];
            checkDigest(digest, fragment);
            return fragment;
        }
        case 4: {
            //UR:Type/[Sequencing]/[Digest]/[Fragment]
            //should check sequencing and digest
            checkURHeader(pieces[0], type);
            checkAndGetSequence(pieces[1]);
            const digest = pieces[2];
            const fragment = pieces[3];
            checkDigest(digest, fragment);
            return fragment;
        }
        default:
            throw new Error(`invalid workload pieces length: expect 2 / 3 / 4 bug got ${pieces.length}`);
    }
};

const dealWithMultipleWorkloads = (workloads: string[], type = 'bytes'): string => {
    const length = workloads.length;
    const fragments = new Array(length).fill('');
    let digest = '';
    workloads.forEach((workload) => {
        const pieces = workload.split('/');
        checkURHeader(pieces[0], type);
        const [index, total] = checkAndGetSequence(pieces[1]);
        if (total !== length)
            throw new Error(`invalid workload: ${workload}, total ${total} not equal workloads length ${length}`);
        if (digest && digest !== pieces[2])
            throw new Error(`invalid workload: ${workload}, checksum changed ${digest}, ${pieces[2]}`);
        digest = pieces[2];
        if (fragments[index - 1]) throw new Error(`invalid workload: ${workload}, index ${index} has already been set`);
        fragments[index - 1] = pieces[3];
    });
    const payload = fragments.join('');
    checkDigest(digest, payload);
    return payload;
};

const getBC32Payload = (workloads: string[], type = 'bytes'): string => {
    try {
        const length = workloads.length;
        if (length === 1) {
            return dealWithSingleWorkload(workloads[0], type);
        } else {
            return dealWithMultipleWorkloads(workloads, type);
        }
    } catch (e) {
        throw new Error(`invalid workloads: ${workloads}\n ${e}`);
    }
};

export const decodeUR = (workloads: string[], type = 'bytes'): string => {
    const bc32Payload = getBC32Payload(workloads, type);
    const cborPayload = decodeBc32Data(bc32Payload);
    if (!cborPayload) {
        throw new Error('invalid data');
    }
    return decodeSimpleCBOR(cborPayload);
};

export const extractSingleWorkload = (workload: string): [number, number] => {
    const pieces = workload.toUpperCase().split('/');
    switch (pieces.length) {
        case 2: //UR:Type/[Fragment]
        case 3: {
            //UR:Type/[Digest]/[Fragment] when Sequencing is omitted, Digest MAY be omitted;
            return [1, 1];
        }
        case 4: {
            //UR:Type/[Sequencing]/[Digest]/[Fragment]
            return checkAndGetSequence(pieces[1]);
        }
        default:
            throw new Error(`invalid workload pieces length: expect 2 / 3 / 4 bug got ${pieces.length}`);
    }
};
