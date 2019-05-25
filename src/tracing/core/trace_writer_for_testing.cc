/*
 * Copyright (C) 2018 The Android Open Source Project
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

#include "src/tracing/core/trace_writer_for_testing.h"

#include "perfetto/base/logging.h"
#include "perfetto/base/utils.h"
#include "perfetto/protozero/message.h"
#include "perfetto/trace/trace.pb.h"
#include "perfetto/trace/trace.pbzero.h"
#include "perfetto/trace/trace_packet.pb.h"
#include "perfetto/trace/trace_packet.pbzero.h"

namespace perfetto {

TraceWriterForTesting::TraceWriterForTesting()
    : delegate_(static_cast<size_t>(base::kPageSize),
                static_cast<size_t>(base::kPageSize)),
      stream_(&delegate_) {
  delegate_.set_writer(&stream_);
  cur_packet_.reset(new protos::pbzero::TracePacket());
  cur_packet_->Finalize();  // To avoid the DCHECK in NewTracePacket().
}

TraceWriterForTesting::~TraceWriterForTesting() {}

void TraceWriterForTesting::Flush(std::function<void()> callback) {
  // Flush() cannot be called in the middle of a TracePacket.
  PERFETTO_CHECK(cur_packet_->is_finalized());

  if (callback)
    callback();
}

std::vector<protos::TracePacket> TraceWriterForTesting::GetAllTracePackets() {
  PERFETTO_CHECK(cur_packet_->is_finalized());

  auto trace = protos::Trace();
  std::vector<uint8_t> buffer = delegate_.StitchSlices();
  if (!trace.ParseFromArray(buffer.data(), static_cast<int>(buffer.size())))
    return {};

  std::vector<protos::TracePacket> ret;
  for (const auto& packet : trace.packet()) {
    ret.emplace_back(packet);
  }
  return ret;
}

std::unique_ptr<protos::TracePacket> TraceWriterForTesting::ParseProto() {
  PERFETTO_CHECK(cur_packet_->is_finalized());

  auto trace = GetAllTracePackets();
  PERFETTO_CHECK(!trace.empty());
  auto packet =
      std::unique_ptr<protos::TracePacket>(new protos::TracePacket(trace[0]));
  return packet;
}

TraceWriterForTesting::TracePacketHandle
TraceWriterForTesting::NewTracePacket() {
  // If we hit this, the caller is calling NewTracePacket() without having
  // finalized the previous packet.
  PERFETTO_DCHECK(cur_packet_->is_finalized());
  cur_packet_->Reset(&stream_);

  // Instead of storing the contents of the TracePacket directly in the backing
  // buffer like the real trace writers, we prepend the proto preamble to make
  // the buffer contents parsable as a sequence of TracePacket protos.

  uint8_t data[protozero::proto_utils::kMaxTagEncodedSize];
  uint8_t* data_end = protozero::proto_utils::WriteVarInt(
      protozero::proto_utils::MakeTagLengthDelimited(
          protos::pbzero::Trace::kPacketFieldNumber),
      data);
  stream_.WriteBytes(data, static_cast<uint32_t>(data_end - data));

  auto packet = TraceWriter::TracePacketHandle(cur_packet_.get());
  packet->set_size_field(
      stream_.ReserveBytes(protozero::proto_utils::kMessageLengthFieldSize));
  return packet;
}

WriterID TraceWriterForTesting::writer_id() const {
  return 0;
}

uint64_t TraceWriterForTesting::written() const {
  return 0;
}

}  // namespace perfetto
